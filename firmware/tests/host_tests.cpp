#include <cmath>
#include <cstring>
#include <iostream>
#include <stdint.h>

#include "core/calibration.h"
#include "core/command_parser.h"
#include "core/moisture_filter.h"
#include "core/persistent_budget.h"
#include "core/policy.h"
#include "core/telemetry.h"
#include "core/watering_controller.h"

namespace {

int failures = 0;
int assertions = 0;

#define EXPECT_TRUE(expression) do { \
    ++assertions; \
    if (!(expression)) { \
        ++failures; \
        std::cerr << __FILE__ << ':' << __LINE__ << " expected true: " #expression << '\n'; \
    } \
} while (false)

#define EXPECT_FALSE(expression) EXPECT_TRUE(!(expression))

#define EXPECT_EQ(expected, actual) do { \
    ++assertions; \
    const auto expectedValue = (expected); \
    const auto actualValue = (actual); \
    if (!(expectedValue == actualValue)) { \
        ++failures; \
        std::cerr << __FILE__ << ':' << __LINE__ << " expected equality: " \
                  << #expected << " == " << #actual << '\n'; \
    } \
} while (false)

#define EXPECT_NEAR(expected, actual, tolerance) do { \
    ++assertions; \
    if (std::fabs(static_cast<double>(expected) - static_cast<double>(actual)) > (tolerance)) { \
        ++failures; \
        std::cerr << __FILE__ << ':' << __LINE__ << " expected near: " \
                  << #expected << " ~= " << #actual << '\n'; \
    } \
} while (false)

const char kCommandId[] = "123e4567-e89b-12d3-a456-426614174000";
const char kSecondCommandId[] = "123e4567-e89b-12d3-a456-426614174001";
const uint32_t kNow = 1800000000U;

plant::SafetyInputs safeInputs() {
    plant::SafetyInputs safety = {};
    safety.tankLow = false;
    safety.leakDetected = false;
    safety.sensorValid = true;
    return safety;
}

plant::WaterCommand command(const char* id, uint16_t doseMl, uint32_t expiresAt) {
    plant::WaterCommand value = {};
    std::memcpy(value.commandId, id, plant::kCommandIdLength + 1U);
    value.doseMl = doseMl;
    value.expiresAtEpoch = expiresAt;
    return value;
}

void testCalibrationMapsAndClamps() {
    const plant::Calibration calibration = {3000U, 1400U, 200U, true};
    bool valid = false;
    EXPECT_NEAR(0.0, plant::moisturePercent(3000U, calibration, &valid), 0.01);
    EXPECT_TRUE(valid);
    EXPECT_NEAR(100.0, plant::moisturePercent(1400U, calibration, &valid), 0.01);
    EXPECT_NEAR(50.0, plant::moisturePercent(2200U, calibration, &valid), 0.01);
    EXPECT_NEAR(0.0, plant::moisturePercent(4095U, calibration, &valid), 0.01);
    EXPECT_NEAR(100.0, plant::moisturePercent(0U, calibration, &valid), 0.01);
}

void testCalibrationSupportsReversedSensors() {
    const plant::Calibration calibration = {1000U, 3000U, 200U, true};
    bool valid = false;
    EXPECT_NEAR(50.0, plant::moisturePercent(2000U, calibration, &valid), 0.01);
    EXPECT_TRUE(valid);
}

void testCalibrationRejectsNarrowSpan() {
    const plant::Calibration calibration = {2000U, 2050U, 200U, false};
    bool valid = true;
    EXPECT_NEAR(0.0, plant::moisturePercent(2025U, calibration, &valid), 0.01);
    EXPECT_FALSE(valid);
}

void testFilterRejectsSingleSampleSpike() {
    plant::MoistureFilter filter;
    EXPECT_EQ(2000U, filter.add(2000U));
    EXPECT_EQ(2000U, filter.add(2000U));
    EXPECT_EQ(2000U, filter.add(2000U));
    EXPECT_EQ(2000U, filter.add(2000U));
    EXPECT_EQ(2000U, filter.add(4000U));
    EXPECT_EQ(2000U, filter.add(4000U));
    EXPECT_EQ(2700U, filter.add(4000U));
}

void testFilterResetClearsValue() {
    plant::MoistureFilter filter;
    filter.add(1234U);
    filter.reset();
    EXPECT_FALSE(filter.initialized());
    EXPECT_EQ(0U, filter.value());
}

void testCommandParserAcceptsCanonicalPayload() {
    plant::WaterCommand parsed = {};
    const plant::CommandParseError error = plant::parseWaterCommand(
        "123e4567-e89b-12d3-a456-426614174000|50|1800000030",
        &parsed);
    EXPECT_EQ(plant::CommandParseError::None, error);
    EXPECT_TRUE(std::strcmp(kCommandId, parsed.commandId) == 0);
    EXPECT_EQ(50U, parsed.doseMl);
    EXPECT_EQ(1800000030U, parsed.expiresAtEpoch);
    EXPECT_TRUE(plant::validCommandId(parsed.commandId));
}

void testCommandParserRejectsBadShapes() {
    plant::WaterCommand parsed = {};
    EXPECT_EQ(
        plant::CommandParseError::BadFieldCount,
        plant::parseWaterCommand("123e4567-e89b-12d3-a456-426614174000|50", &parsed));
    EXPECT_EQ(
        plant::CommandParseError::BadFieldCount,
        plant::parseWaterCommand("123e4567-e89b-12d3-a456-426614174000|50|1800000030|x", &parsed));
    EXPECT_EQ(
        plant::CommandParseError::InvalidDose,
        plant::parseWaterCommand("123e4567-e89b-12d3-a456-426614174000|-5|1800000030", &parsed));
    EXPECT_EQ(
        plant::CommandParseError::InvalidExpiry,
        plant::parseWaterCommand("123e4567-e89b-12d3-a456-426614174000|50|99999999999", &parsed));
}

void testCommandIdRequiresUuidShape() {
    EXPECT_TRUE(plant::validCommandId(kCommandId));
    EXPECT_FALSE(plant::validCommandId("not-a-uuid"));
    EXPECT_FALSE(plant::validCommandId("123e4567xe89b-12d3-a456-426614174000"));
    EXPECT_FALSE(plant::validCommandId("g23e4567-e89b-12d3-a456-426614174000"));
}

void testPolicyDefaultsToMonitor() {
    const plant::WateringPolicy policy = plant::defaultWateringPolicy();
    plant::PolicyInputs inputs = {};
    EXPECT_EQ(plant::OperatingMode::Monitor, policy.mode);
    EXPECT_FALSE(policy.calibrated);
    EXPECT_EQ(plant::PolicyDecision::ModeDisabled, plant::evaluatePolicy(policy, inputs));
}

void testPolicyRequiresCalibrationAndThreeDrySamples() {
    plant::WateringPolicy policy = plant::defaultWateringPolicy();
    policy.mode = plant::OperatingMode::Automatic;
    plant::PolicyInputs inputs = {};
    inputs.sensorValid = true;
    inputs.moisturePercent = 20.0F;
    inputs.consecutiveDrySamples = 2U;
    inputs.nowEpoch = kNow;
    EXPECT_EQ(plant::PolicyDecision::NotCalibrated, plant::evaluatePolicy(policy, inputs));
    policy.calibrated = true;
    EXPECT_EQ(plant::PolicyDecision::NeedMoreDrySamples, plant::evaluatePolicy(policy, inputs));
    inputs.consecutiveDrySamples = 3U;
    EXPECT_EQ(plant::PolicyDecision::Water, plant::evaluatePolicy(policy, inputs));
}

void testPolicyHonorsWeatherCooldownAndBudget() {
    plant::WateringPolicy policy = plant::defaultWateringPolicy();
    policy.mode = plant::OperatingMode::Automatic;
    policy.calibrated = true;
    plant::PolicyInputs inputs = {};
    inputs.sensorValid = true;
    inputs.moisturePercent = 20.0F;
    inputs.consecutiveDrySamples = 3U;
    inputs.nowEpoch = kNow;
    inputs.weatherFresh = true;
    inputs.rainSuppressed = true;
    EXPECT_EQ(plant::PolicyDecision::RainSuppressed, plant::evaluatePolicy(policy, inputs));
    inputs.rainSuppressed = false;
    inputs.hasLastRun = true;
    inputs.lastRunEpoch = kNow - 60U;
    EXPECT_EQ(plant::PolicyDecision::Cooldown, plant::evaluatePolicy(policy, inputs));
    inputs.hasLastRun = false;
    inputs.usedTodayMl = 225U;
    EXPECT_EQ(plant::PolicyDecision::DailyLimit, plant::evaluatePolicy(policy, inputs));
}

void testControllerBootsPumpOffInMonitorMode() {
    plant::WateringController controller(plant::defaultControllerConfig());
    EXPECT_EQ(plant::WateringState::Idle, controller.state());
    EXPECT_EQ(plant::OperatingMode::Monitor, controller.mode());
    EXPECT_FALSE(controller.pumpRequested());
}

void testManualCommandRunsThenCoolsDownWithoutDelay() {
    plant::WateringController controller(plant::defaultControllerConfig());
    const plant::CommandResult result = controller.requestManual(
        command(kCommandId, 50U, kNow + 30U),
        kNow,
        1000U,
        safeInputs());
    EXPECT_TRUE(result.accepted);
    EXPECT_EQ(30000U, result.runDurationMs);
    EXPECT_TRUE(controller.pumpRequested());
    controller.tick(kNow + 29U, 30999U, safeInputs());
    EXPECT_TRUE(controller.pumpRequested());
    controller.tick(kNow + 30U, 31000U, safeInputs());
    EXPECT_FALSE(controller.pumpRequested());
    EXPECT_EQ(plant::WateringState::Cooldown, controller.state());
    controller.tick(kNow + 89U, 90999U, safeInputs());
    EXPECT_EQ(plant::WateringState::Cooldown, controller.state());
    controller.tick(kNow + 90U, 91000U, safeInputs());
    EXPECT_EQ(plant::WateringState::Idle, controller.state());
}

void testMillisWrapDoesNotExtendPumpRun() {
    plant::ControllerConfig config = plant::defaultControllerConfig();
    config.pumpMlPerMinute = 1000U;
    plant::WateringController controller(config);
    const uint32_t startedAt = UINT32_MAX - 100U;
    const plant::CommandResult result = controller.requestManual(
        command(kCommandId, 5U, kNow + 30U),
        kNow,
        startedAt,
        safeInputs());
    EXPECT_EQ(300U, result.runDurationMs);
    controller.tick(kNow, static_cast<uint32_t>(startedAt + 299U), safeInputs());
    EXPECT_TRUE(controller.pumpRequested());
    controller.tick(kNow, static_cast<uint32_t>(startedAt + 300U), safeInputs());
    EXPECT_FALSE(controller.pumpRequested());
}

void testLeakStopsPumpAndLatchesLockout() {
    plant::WateringController controller(plant::defaultControllerConfig());
    controller.requestManual(command(kCommandId, 50U, kNow + 30U), kNow, 0U, safeInputs());
    plant::SafetyInputs leak = safeInputs();
    leak.leakDetected = true;
    controller.tick(kNow, 1U, leak);
    EXPECT_FALSE(controller.pumpRequested());
    EXPECT_EQ(plant::WateringState::Lockout, controller.state());
    EXPECT_EQ(plant::Fault::Leak, controller.fault());
    EXPECT_FALSE(controller.clearLockout(leak));
    EXPECT_TRUE(controller.clearLockout(safeInputs()));
    EXPECT_EQ(plant::OperatingMode::Monitor, controller.mode());
}

void testTankLowRejectsAndLatches() {
    plant::WateringController controller(plant::defaultControllerConfig());
    plant::SafetyInputs tankLow = safeInputs();
    tankLow.tankLow = true;
    const plant::CommandResult result = controller.requestManual(
        command(kCommandId, 50U, kNow + 30U),
        kNow,
        0U,
        tankLow);
    EXPECT_FALSE(result.accepted);
    EXPECT_EQ(plant::RejectReason::TankLow, result.reason);
    EXPECT_EQ(plant::WateringState::Lockout, controller.state());
}

void testSensorFaultRejectsStartAndStopsActiveRun() {
    plant::WateringController controller(plant::defaultControllerConfig());
    plant::SafetyInputs sensorFault = safeInputs();
    sensorFault.sensorValid = false;
    const plant::CommandResult rejected = controller.requestManual(
        command(kCommandId, 50U, kNow + 30U),
        kNow,
        0U,
        sensorFault);
    EXPECT_EQ(plant::RejectReason::SensorFault, rejected.reason);
    const plant::CommandResult accepted = controller.requestManual(
        command(kCommandId, 50U, kNow + 30U),
        kNow,
        1U,
        safeInputs());
    EXPECT_TRUE(accepted.accepted);
    controller.tick(kNow, 2U, sensorFault);
    EXPECT_FALSE(controller.pumpRequested());
    EXPECT_EQ(plant::Fault::Sensor, controller.fault());
}

void testCommandValidationBoundaries() {
    plant::WateringController controller(plant::defaultControllerConfig());
    EXPECT_EQ(
        plant::RejectReason::Expired,
        controller.requestManual(command(kCommandId, 50U, kNow), kNow, 0U, safeInputs()).reason);
    EXPECT_EQ(
        plant::RejectReason::ExpiryTooFar,
        controller.requestManual(command(kCommandId, 50U, kNow + 61U), kNow, 0U, safeInputs()).reason);
    EXPECT_EQ(
        plant::RejectReason::DoseOutOfRange,
        controller.requestManual(command(kCommandId, 4U, kNow + 30U), kNow, 0U, safeInputs()).reason);
    EXPECT_EQ(
        plant::RejectReason::ClockInvalid,
        controller.requestManual(command(kCommandId, 50U, kNow + 30U), 1U, 0U, safeInputs()).reason);
}

void testDuplicateRejectedBeforeSecondDose() {
    plant::WateringController controller(plant::defaultControllerConfig());
    const plant::WaterCommand request = command(kCommandId, 25U, kNow + 30U);
    EXPECT_TRUE(controller.requestManual(request, kNow, 0U, safeInputs()).accepted);
    EXPECT_EQ(
        plant::RejectReason::Duplicate,
        controller.requestManual(request, kNow, 1U, safeInputs()).reason);
    EXPECT_EQ(25U, controller.budgetSnapshot().reservedMl);
}

void testRestoredBudgetAndIdSurviveControllerRestart() {
    plant::WateringController controller(plant::defaultControllerConfig());
    controller.restoreBudget(kNow / 86400U, 225U, kCommandId);
    EXPECT_EQ(
        plant::RejectReason::Duplicate,
        controller.requestManual(
            command(kCommandId, 20U, kNow + 30U),
            kNow,
            0U,
            safeInputs()).reason);
    EXPECT_EQ(
        plant::RejectReason::DailyLimit,
        controller.requestManual(
            command(kSecondCommandId, 30U, kNow + 30U),
            kNow,
            0U,
            safeInputs()).reason);
}

void testBudgetResetsOnlyWhenClockMovesToNewDay() {
    const uint32_t today = kNow / 86400U;
    plant::WateringController nextDayController(plant::defaultControllerConfig());
    nextDayController.restoreBudget(today, 250U, kCommandId);
    const uint32_t tomorrowEpoch = (today + 1U) * 86400U;
    EXPECT_TRUE(nextDayController.requestManual(
        command(kSecondCommandId, 50U, tomorrowEpoch + 30U),
        tomorrowEpoch,
        0U,
        safeInputs()).accepted);
    EXPECT_EQ(50U, nextDayController.budgetSnapshot().reservedMl);

    plant::WateringController backwardsClockController(plant::defaultControllerConfig());
    backwardsClockController.restoreBudget(today + 1U, 250U, kCommandId);
    EXPECT_EQ(
        plant::RejectReason::DailyLimit,
        backwardsClockController.requestManual(
            command(kSecondCommandId, 50U, kNow + 30U),
            kNow,
            0U,
            safeInputs()).reason);
}

void testStorageFaultNeverRequestsPump() {
    plant::WateringController controller(plant::defaultControllerConfig());
    EXPECT_TRUE(controller.requestManual(
        command(kCommandId, 50U, kNow + 30U),
        kNow,
        0U,
        safeInputs()).accepted);
    controller.latchStorageFault();
    EXPECT_FALSE(controller.pumpRequested());
    EXPECT_EQ(plant::Fault::Storage, controller.fault());
    EXPECT_FALSE(controller.clearLockout(safeInputs()));
}

void testTelemetryMatchesDashboardV1Contract() {
    plant::TelemetryV1 telemetry = {};
    telemetry.eventId = "device-1";
    telemetry.deviceId = "0123456789abcdef01234567";
    telemetry.sequence = 1U;
    telemetry.recordedAt = "2026-07-25T12:00:00Z";
    telemetry.firmwareVersion = "0.1.0";
    telemetry.moistureRaw = 2200U;
    telemetry.moisturePercent = 50.0F;
    telemetry.tankLow = false;
    telemetry.leakDetected = false;
    telemetry.pumpActive = false;
    telemetry.sensorStatus = "ok";
    telemetry.faultCode = 0;
    char output[768] = {};
    EXPECT_TRUE(plant::formatTelemetryV1(output, sizeof(output), telemetry));
    EXPECT_TRUE(std::strcmp(
        output,
        "{\"version\":1,\"eventId\":\"device-1\",\"deviceId\":\"0123456789abcdef01234567\","
        "\"sequence\":1,\"recordedAt\":\"2026-07-25T12:00:00Z\",\"firmwareVersion\":\"0.1.0\","
        "\"moistureRaw\":2200,\"moisturePercent\":50.0,"
        "\"airTemperatureC\":null,\"relativeHumidityPercent\":null,\"lightLux\":null,"
        "\"tankLow\":false,\"leakDetected\":false,\"pumpActive\":false,"
        "\"sensorStatus\":\"ok\",\"faultCode\":null}") == 0);
}

void testTelemetryFormatsFaultAndRejectsSmallBuffer() {
    plant::TelemetryV1 telemetry = {};
    telemetry.eventId = "device-2";
    telemetry.deviceId = "0123456789abcdef01234567";
    telemetry.sequence = 2U;
    telemetry.recordedAt = "2026-07-25T12:01:00Z";
    telemetry.firmwareVersion = "0.1.0";
    telemetry.sensorStatus = "fault";
    telemetry.faultCode = "leak_detected";
    char output[768] = {};
    EXPECT_TRUE(plant::formatTelemetryV1(output, sizeof(output), telemetry));
    EXPECT_TRUE(std::strstr(output, "\"faultCode\":\"leak_detected\"") != 0);
    char tooSmall[20] = {};
    EXPECT_FALSE(plant::formatTelemetryV1(tooSmall, sizeof(tooSmall), telemetry));
}

void testPersistentBudgetDistinguishesErasedValidAndCorrupt() {
    plant::PersistentBudgetRecord erased;
    std::memset(&erased, 0xFF, sizeof(erased));
    EXPECT_EQ(
        plant::PersistentRecordStatus::Erased,
        plant::inspectPersistentBudgetRecord(erased));

    plant::PersistentBudgetRecord valid = plant::makePersistentBudgetRecord(
        kNow / 86400U,
        7U,
        125U,
        kCommandId);
    EXPECT_EQ(
        plant::PersistentRecordStatus::Valid,
        plant::inspectPersistentBudgetRecord(valid));
    EXPECT_EQ(125U, valid.reservedMl);
    EXPECT_EQ(7U, valid.bootCounter);
    EXPECT_TRUE(std::strcmp(kCommandId, valid.lastCommandId) == 0);

    valid.reservedMl = 0U;
    EXPECT_EQ(
        plant::PersistentRecordStatus::Corrupt,
        plant::inspectPersistentBudgetRecord(valid));
}

void testPersistentBudgetAllowsVerifiedFirstBootRecord() {
    const plant::PersistentBudgetRecord initialized = plant::makePersistentBudgetRecord(
        0U,
        1U,
        0U,
        "");
    EXPECT_EQ(
        plant::PersistentRecordStatus::Valid,
        plant::inspectPersistentBudgetRecord(initialized));
    EXPECT_TRUE(initialized.lastCommandId[0] == '\0');
}

} // namespace

int main() {
    testCalibrationMapsAndClamps();
    testCalibrationSupportsReversedSensors();
    testCalibrationRejectsNarrowSpan();
    testFilterRejectsSingleSampleSpike();
    testFilterResetClearsValue();
    testCommandParserAcceptsCanonicalPayload();
    testCommandParserRejectsBadShapes();
    testCommandIdRequiresUuidShape();
    testPolicyDefaultsToMonitor();
    testPolicyRequiresCalibrationAndThreeDrySamples();
    testPolicyHonorsWeatherCooldownAndBudget();
    testControllerBootsPumpOffInMonitorMode();
    testManualCommandRunsThenCoolsDownWithoutDelay();
    testMillisWrapDoesNotExtendPumpRun();
    testLeakStopsPumpAndLatchesLockout();
    testTankLowRejectsAndLatches();
    testSensorFaultRejectsStartAndStopsActiveRun();
    testCommandValidationBoundaries();
    testDuplicateRejectedBeforeSecondDose();
    testRestoredBudgetAndIdSurviveControllerRestart();
    testBudgetResetsOnlyWhenClockMovesToNewDay();
    testStorageFaultNeverRequestsPump();
    testTelemetryMatchesDashboardV1Contract();
    testTelemetryFormatsFaultAndRejectsSmallBuffer();
    testPersistentBudgetDistinguishesErasedValidAndCorrupt();
    testPersistentBudgetAllowsVerifiedFirstBootRecord();

    if (failures != 0) {
        std::cerr << failures << " of " << assertions << " assertions failed\n";
        return 1;
    }
    std::cout << "PASS: " << assertions << " assertions\n";
    return 0;
}
