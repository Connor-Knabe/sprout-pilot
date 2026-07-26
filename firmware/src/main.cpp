#include "Particle.h"

#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "core/calibration.h"
#include "core/command_parser.h"
#include "core/moisture_filter.h"
#include "core/persistent_budget.h"
#include "core/telemetry.h"
#include "core/watering_controller.h"

SYSTEM_MODE(AUTOMATIC);
SYSTEM_THREAD(ENABLED);

namespace {

const pin_t kSoilPin = A0;
const pin_t kPumpPin = D2;
const pin_t kTankStatusPin = D3;
const pin_t kLeakPin = D4;

const uint32_t kSensorIntervalMs = 5000U;
const uint32_t kTelemetryIntervalMs = 5U * 60U * 1000U;
const uint16_t kMinimumPlausibleRaw = 50U;
const uint16_t kMaximumPlausibleRaw = 4045U;
const char kFirmwareVersion[] = "0.1.0";

// True boot safety requires the documented external 100k pull-down. This hook
// minimizes the interval before firmware owns D2; setup repeats the operation.
void forcePumpOffAtStartup() {
    digitalWrite(D2, LOW);
    pinMode(D2, OUTPUT);
    digitalWrite(D2, LOW);
}

plant::WateringController controller(plant::defaultControllerConfig());
plant::MoistureFilter moistureFilter;
const plant::Calibration moistureCalibration = {3000U, 1400U, 200U, false};

uint16_t latestMoistureRaw = 0U;
float latestMoisturePercent = 0.0F;
bool sensorValid = false;
bool sampledOnce = false;
uint32_t lastSampleMs = 0U;
bool publishedOnce = false;
uint32_t lastPublishMs = 0U;
uint32_t telemetrySequence = 0U;
uint32_t bootCounter = 0U;
bool forceTelemetry = true;
plant::WateringState lastReportedState = plant::WateringState::Idle;
plant::Fault lastReportedFault = plant::Fault::None;
bool lastReportedTankLow = false;
bool lastReportedLeak = false;
bool lastReportedSensorValid = false;

bool persistBudget() {
    const plant::BudgetSnapshot snapshot = controller.budgetSnapshot();
    const plant::PersistentBudgetRecord record = plant::makePersistentBudgetRecord(
        snapshot.epochDay,
        bootCounter,
        snapshot.reservedMl,
        snapshot.lastCommandId);
    EEPROM.put(0, record);

    plant::PersistentBudgetRecord verification = {};
    EEPROM.get(0, verification);
    return plant::inspectPersistentBudgetRecord(verification) ==
            plant::PersistentRecordStatus::Valid &&
        verification.epochDay == record.epochDay &&
        verification.bootCounter == record.bootCounter &&
        verification.reservedMl == record.reservedMl &&
        strcmp(verification.lastCommandId, record.lastCommandId) == 0;
}

void loadBudget() {
    plant::PersistentBudgetRecord record = {};
    EEPROM.get(0, record);
    const plant::PersistentRecordStatus status = plant::inspectPersistentBudgetRecord(record);
    if (status == plant::PersistentRecordStatus::Valid) {
        controller.restoreBudget(record.epochDay, record.reservedMl, record.lastCommandId);
        bootCounter = record.bootCounter + 1U;
        if (bootCounter == 0U) {
            bootCounter = 1U;
        }
        if (persistBudget()) {
            return;
        }
    }
    if (status == plant::PersistentRecordStatus::Erased) {
        bootCounter = 1U;
        if (persistBudget()) {
            return;
        }
    }
    // Corruption must not reset the daily cap. Stay off until inspection/reflash.
    controller.latchStorageFault();
}

plant::SafetyInputs readSafety() {
    plant::SafetyInputs safety = {};
    // NC status float: closed-to-GND/LOW is healthy; open/HIGH is low or unplugged.
    safety.tankLow = digitalRead(kTankStatusPin) == HIGH;
    // Leak module/open collector: dry/HIGH; leak/LOW.
    safety.leakDetected = digitalRead(kLeakPin) == LOW;
    safety.sensorValid = sensorValid;
    return safety;
}

void applyPumpOutput(const plant::SafetyInputs& safety) {
    // Re-read physical inputs at the output boundary. The separate series NC
    // float remains the final hardware cutoff if firmware stalls.
    const bool physicalInputsSafe = digitalRead(kTankStatusPin) == LOW &&
        digitalRead(kLeakPin) == HIGH;
    const bool turnOn = controller.pumpRequested() && safety.sensorValid &&
        !safety.tankLow && !safety.leakDetected && physicalInputsSafe;
    digitalWrite(kPumpPin, turnOn ? HIGH : LOW);
}

void sampleMoisture(uint32_t nowMs) {
    if (controller.pumpRequested()) {
        return;
    }
    if (sampledOnce && static_cast<uint32_t>(nowMs - lastSampleMs) < kSensorIntervalMs) {
        return;
    }
    sampledOnce = true;
    lastSampleMs = nowMs;

    const int reading = analogRead(kSoilPin);
    latestMoistureRaw = reading < 0 ? 0U : static_cast<uint16_t>(reading);
    sensorValid = latestMoistureRaw >= kMinimumPlausibleRaw &&
        latestMoistureRaw <= kMaximumPlausibleRaw;
    if (!sensorValid) {
        latestMoisturePercent = 0.0F;
        forceTelemetry = true;
        return;
    }

    const uint16_t filtered = moistureFilter.add(latestMoistureRaw);
    bool calibrationValid = false;
    latestMoisturePercent = plant::moisturePercent(
        filtered,
        moistureCalibration,
        &calibrationValid);
    sensorValid = sensorValid && calibrationValid;
}

bool telemetryChanged(const plant::SafetyInputs& safety) {
    return controller.state() != lastReportedState ||
        controller.fault() != lastReportedFault ||
        safety.tankLow != lastReportedTankLow ||
        safety.leakDetected != lastReportedLeak ||
        safety.sensorValid != lastReportedSensorValid;
}

void rememberTelemetryState(const plant::SafetyInputs& safety) {
    lastReportedState = controller.state();
    lastReportedFault = controller.fault();
    lastReportedTankLow = safety.tankLow;
    lastReportedLeak = safety.leakDetected;
    lastReportedSensorValid = safety.sensorValid;
}

void publishTelemetry(uint32_t nowEpoch, uint32_t nowMs, const plant::SafetyInputs& safety) {
    if (!Particle.connected() || !Time.isValid()) {
        return;
    }
    const bool periodicDue = !publishedOnce ||
        static_cast<uint32_t>(nowMs - lastPublishMs) >= kTelemetryIntervalMs;
    if (!forceTelemetry && !telemetryChanged(safety) && !periodicDue) {
        return;
    }

    const String deviceId = System.deviceID();
    const String recordedAt = Time.format(
        static_cast<time_t>(nowEpoch),
        "%Y-%m-%dT%H:%M:%SZ");
    ++telemetrySequence;
    char eventId[80] = {};
    snprintf(
        eventId,
        sizeof(eventId),
        "%s-%lu-%lu-%lu",
        deviceId.c_str(),
        static_cast<unsigned long>(bootCounter),
        static_cast<unsigned long>(nowEpoch),
        static_cast<unsigned long>(telemetrySequence));

    const char* faultCode = 0;
    if (controller.fault() != plant::Fault::None) {
        faultCode = plant::faultName(controller.fault());
    } else if (!safety.sensorValid) {
        faultCode = "sensor_fault";
    }

    char payload[768] = {};
    plant::TelemetryV1 telemetry = {};
    telemetry.eventId = eventId;
    telemetry.deviceId = deviceId.c_str();
    telemetry.sequence = telemetrySequence;
    telemetry.recordedAt = recordedAt.c_str();
    telemetry.firmwareVersion = kFirmwareVersion;
    telemetry.moistureRaw = latestMoistureRaw;
    telemetry.moisturePercent = latestMoisturePercent;
    telemetry.tankLow = safety.tankLow;
    telemetry.leakDetected = safety.leakDetected;
    telemetry.pumpActive = controller.pumpRequested();
    telemetry.sensorStatus = safety.sensorValid ? "ok" : "fault";
    telemetry.faultCode = faultCode;
    if (!plant::formatTelemetryV1(payload, sizeof(payload), telemetry)) {
        return;
    }

    Particle.publish("plant.telemetry.v1", payload, PRIVATE);
    publishedOnce = true;
    lastPublishMs = nowMs;
    forceTelemetry = false;
    rememberTelemetryState(safety);
}

void publishCommandResult(
    const plant::WaterCommand& command,
    const plant::CommandResult& result) {
    if (!Particle.connected()) {
        return;
    }
    char payload[256] = {};
    const char* status = result.accepted ? "accepted" : "rejected";
    char reasonJson[48] = "null";
    if (!result.accepted) {
        snprintf(
            reasonJson,
            sizeof(reasonJson),
            "\"%s\"",
            plant::rejectReasonName(result.reason));
    }
    const int written = snprintf(
        payload,
        sizeof(payload),
        "{\"version\":1,\"commandId\":\"%s\",\"status\":\"%s\","
        "\"reason\":%s,\"doseMl\":%u,\"state\":\"%s\"}",
        command.commandId,
        status,
        reasonJson,
        static_cast<unsigned int>(command.doseMl),
        plant::wateringStateName(controller.state()));
    if (written >= 0 && static_cast<size_t>(written) < sizeof(payload)) {
        Particle.publish("plant.command-result.v1", payload, PRIVATE);
    }
}

int resultCode(plant::RejectReason reason) {
    switch (reason) {
        case plant::RejectReason::None: return 1;
        case plant::RejectReason::InvalidCommandId: return -2;
        case plant::RejectReason::DoseOutOfRange: return -3;
        case plant::RejectReason::ClockInvalid: return -4;
        case plant::RejectReason::Expired: return -5;
        case plant::RejectReason::ExpiryTooFar: return -6;
        case plant::RejectReason::Busy: return -7;
        case plant::RejectReason::Cooldown: return -8;
        case plant::RejectReason::TankLow: return -9;
        case plant::RejectReason::LeakDetected: return -10;
        case plant::RejectReason::SensorFault: return -11;
        case plant::RejectReason::DailyLimit: return -12;
        case plant::RejectReason::Duplicate: return -13;
        case plant::RejectReason::LockedOut: return -14;
        case plant::RejectReason::Paused: return -15;
        case plant::RejectReason::RunTooLong: return -16;
        case plant::RejectReason::StorageFault: return -17;
    }
    return -14;
}

int waterFunction(String argument) {
    plant::WaterCommand command = {};
    const plant::CommandParseError parseError = plant::parseWaterCommand(argument.c_str(), &command);
    if (parseError != plant::CommandParseError::None) {
        return -1;
    }

    const plant::SafetyInputs safety = readSafety();
    const uint32_t nowEpoch = Time.isValid() ? static_cast<uint32_t>(Time.now()) : 0U;
    const uint32_t nowMs = millis();
    plant::CommandResult result = controller.requestManual(
        command,
        nowEpoch,
        nowMs,
        safety);
    if (result.accepted && !persistBudget()) {
        controller.latchStorageFault();
        result.accepted = false;
        result.reason = plant::RejectReason::StorageFault;
        result.runDurationMs = 0U;
        digitalWrite(kPumpPin, LOW);
        publishCommandResult(command, result);
        forceTelemetry = true;
        return resultCode(result.reason);
    }

    applyPumpOutput(safety);
    publishCommandResult(command, result);
    forceTelemetry = true;
    return resultCode(result.reason);
}

int clearFaultFunction(String argument) {
    if (argument != "reset") {
        return -1;
    }
    const plant::SafetyInputs safety = readSafety();
    const bool cleared = controller.clearLockout(safety);
    applyPumpOutput(safety);
    forceTelemetry = true;
    return cleared ? 1 : -2;
}

} // namespace

STARTUP(forcePumpOffAtStartup());

void setup() {
    forcePumpOffAtStartup();
    pinMode(kTankStatusPin, INPUT_PULLUP);
    pinMode(kLeakPin, INPUT_PULLUP);
    pinMode(kSoilPin, INPUT);

    loadBudget();
    sampleMoisture(millis());
    const plant::SafetyInputs safety = readSafety();
    controller.tick(Time.isValid() ? static_cast<uint32_t>(Time.now()) : 0U, millis(), safety);
    applyPumpOutput(safety);

    Particle.function("water", waterFunction);
    Particle.function("clear_fault", clearFaultFunction);
}

void loop() {
    const uint32_t nowMs = millis();
    sampleMoisture(nowMs);
    const plant::SafetyInputs safety = readSafety();
    const uint32_t nowEpoch = Time.isValid() ? static_cast<uint32_t>(Time.now()) : 0U;
    controller.tick(nowEpoch, nowMs, safety);
    applyPumpOutput(safety);
    publishTelemetry(nowEpoch, nowMs, safety);
}
