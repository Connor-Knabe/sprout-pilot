#include "core/watering_controller.h"

#include <string.h>

namespace plant {
namespace {

const uint32_t kSecondsPerDay = 24U * 60U * 60U;

} // namespace

ControllerConfig defaultControllerConfig() {
    ControllerConfig config = {};
    config.minimumDoseMl = 5U;
    config.maximumDoseMl = 100U;
    config.dailyLimitMl = 250U;
    config.pumpMlPerMinute = 100U;
    config.maximumRunMs = 180U * 1000U;
    config.cooldownMs = 60U * 1000U;
    config.maximumCommandTtlSeconds = 60U;
    config.minimumValidEpoch = 1704067200U; // 2024-01-01 UTC
    return config;
}

WateringController::WateringController(const ControllerConfig& config)
    : config_(config),
      mode_(OperatingMode::Monitor),
      state_(WateringState::Idle),
      fault_(Fault::None),
      startedAtMs_(0U),
      cooldownStartedAtMs_(0U),
      runDurationMs_(0U),
      activeDoseMl_(0U),
      budgetEpochDay_(0U),
      reservedTodayMl_(0U),
      budgetInitialized_(false),
      lastCommandId_{} {
}

CommandResult WateringController::requestManual(
    const WaterCommand& command,
    uint32_t nowEpoch,
    uint32_t nowMs,
    const SafetyInputs& safety) {
    observeSafety(safety);
    if (state_ == WateringState::Lockout) {
        if (fault_ == Fault::TankLow) {
            return reject(RejectReason::TankLow);
        }
        if (fault_ == Fault::Leak) {
            return reject(RejectReason::LeakDetected);
        }
        if (fault_ == Fault::Sensor) {
            return reject(RejectReason::SensorFault);
        }
        return reject(RejectReason::LockedOut);
    }
    if (!validCommandId(command.commandId)) {
        return reject(RejectReason::InvalidCommandId);
    }
    if (command.doseMl < config_.minimumDoseMl || command.doseMl > config_.maximumDoseMl) {
        return reject(RejectReason::DoseOutOfRange);
    }
    if (nowEpoch < config_.minimumValidEpoch) {
        return reject(RejectReason::ClockInvalid);
    }
    if (command.expiresAtEpoch <= nowEpoch) {
        return reject(RejectReason::Expired);
    }
    if ((command.expiresAtEpoch - nowEpoch) > config_.maximumCommandTtlSeconds) {
        return reject(RejectReason::ExpiryTooFar);
    }
    if (strcmp(lastCommandId_, command.commandId) == 0) {
        return reject(RejectReason::Duplicate);
    }
    if (mode_ == OperatingMode::Paused) {
        return reject(RejectReason::Paused);
    }
    if (!safety.sensorValid) {
        return reject(RejectReason::SensorFault);
    }
    if (state_ == WateringState::Watering) {
        return reject(RejectReason::Busy);
    }
    if (state_ == WateringState::Cooldown) {
        return reject(RejectReason::Cooldown);
    }

    updateBudgetDay(nowEpoch);
    if (static_cast<uint32_t>(reservedTodayMl_) + command.doseMl > config_.dailyLimitMl) {
        return reject(RejectReason::DailyLimit);
    }
    if (config_.pumpMlPerMinute == 0U) {
        return reject(RejectReason::RunTooLong);
    }

    const uint64_t numerator = static_cast<uint64_t>(command.doseMl) * 60000ULL;
    const uint32_t duration = static_cast<uint32_t>(
        (numerator + config_.pumpMlPerMinute - 1U) / config_.pumpMlPerMinute);
    if (duration == 0U || duration > config_.maximumRunMs) {
        return reject(RejectReason::RunTooLong);
    }

    // Explicit manual requests remain available in Monitor mode. Monitor only
    // disables policy-driven/autonomous starts.
    reservedTodayMl_ = static_cast<uint16_t>(reservedTodayMl_ + command.doseMl);
    memcpy(lastCommandId_, command.commandId, kCommandIdLength + 1U);
    activeDoseMl_ = command.doseMl;
    runDurationMs_ = duration;
    startedAtMs_ = nowMs;
    state_ = WateringState::Watering;
    fault_ = Fault::None;

    CommandResult accepted = {};
    accepted.accepted = true;
    accepted.reason = RejectReason::None;
    accepted.runDurationMs = duration;
    return accepted;
}

void WateringController::tick(uint32_t nowEpoch, uint32_t nowMs, const SafetyInputs& safety) {
    (void)nowEpoch;
    observeSafety(safety);
    if (state_ != WateringState::Watering && state_ != WateringState::Cooldown) {
        return;
    }
    if (state_ == WateringState::Watering) {
        if (!safety.sensorValid) {
            enterLockout(Fault::Sensor);
            return;
        }
        if (static_cast<uint32_t>(nowMs - startedAtMs_) >= runDurationMs_ ||
            static_cast<uint32_t>(nowMs - startedAtMs_) >= config_.maximumRunMs) {
            state_ = WateringState::Cooldown;
            cooldownStartedAtMs_ = nowMs;
            activeDoseMl_ = 0U;
            runDurationMs_ = 0U;
        }
        return;
    }
    if (static_cast<uint32_t>(nowMs - cooldownStartedAtMs_) >= config_.cooldownMs) {
        state_ = WateringState::Idle;
    }
}

bool WateringController::clearLockout(const SafetyInputs& safety) {
    if (state_ != WateringState::Lockout || safety.tankLow || safety.leakDetected ||
        !safety.sensorValid || fault_ == Fault::Storage) {
        return false;
    }
    state_ = WateringState::Idle;
    fault_ = Fault::None;
    mode_ = OperatingMode::Monitor;
    return true;
}

void WateringController::latchStorageFault() {
    enterLockout(Fault::Storage);
}

void WateringController::setMode(OperatingMode mode) {
    if (state_ != WateringState::Lockout && mode != OperatingMode::Lockout) {
        mode_ = mode;
    }
}

OperatingMode WateringController::mode() const {
    return mode_;
}

WateringState WateringController::state() const {
    return state_;
}

Fault WateringController::fault() const {
    return fault_;
}

bool WateringController::pumpRequested() const {
    return state_ == WateringState::Watering && fault_ == Fault::None;
}

uint16_t WateringController::activeDoseMl() const {
    return activeDoseMl_;
}

uint32_t WateringController::runDurationMs() const {
    return runDurationMs_;
}

void WateringController::restoreBudget(
    uint32_t epochDay,
    uint16_t reservedMl,
    const char* lastCommandId) {
    budgetEpochDay_ = epochDay;
    reservedTodayMl_ = reservedMl > config_.dailyLimitMl ? config_.dailyLimitMl : reservedMl;
    budgetInitialized_ = epochDay != 0U;
    lastCommandId_[0] = '\0';
    if (lastCommandId != 0 && validCommandId(lastCommandId)) {
        memcpy(lastCommandId_, lastCommandId, kCommandIdLength + 1U);
    }
}

BudgetSnapshot WateringController::budgetSnapshot() const {
    BudgetSnapshot snapshot = {};
    snapshot.epochDay = budgetEpochDay_;
    snapshot.reservedMl = reservedTodayMl_;
    memcpy(snapshot.lastCommandId, lastCommandId_, kCommandIdLength + 1U);
    return snapshot;
}

void WateringController::observeSafety(const SafetyInputs& safety) {
    if (safety.leakDetected) {
        enterLockout(Fault::Leak);
    } else if (safety.tankLow) {
        enterLockout(Fault::TankLow);
    }
}

void WateringController::enterLockout(Fault fault) {
    if (state_ == WateringState::Lockout) {
        return;
    }
    state_ = WateringState::Lockout;
    mode_ = OperatingMode::Lockout;
    fault_ = fault;
    activeDoseMl_ = 0U;
    runDurationMs_ = 0U;
}

void WateringController::updateBudgetDay(uint32_t nowEpoch) {
    const uint32_t epochDay = nowEpoch / kSecondsPerDay;
    if (!budgetInitialized_) {
        budgetEpochDay_ = epochDay;
        reservedTodayMl_ = 0U;
        budgetInitialized_ = true;
    } else if (epochDay > budgetEpochDay_) {
        budgetEpochDay_ = epochDay;
        reservedTodayMl_ = 0U;
    }
    // A backwards clock never resets budget; fail conservatively.
}

CommandResult WateringController::reject(RejectReason reason) const {
    CommandResult result = {};
    result.accepted = false;
    result.reason = reason;
    result.runDurationMs = 0U;
    return result;
}

const char* rejectReasonName(RejectReason reason) {
    switch (reason) {
        case RejectReason::None: return "none";
        case RejectReason::InvalidCommandId: return "invalid_command_id";
        case RejectReason::DoseOutOfRange: return "dose_out_of_range";
        case RejectReason::ClockInvalid: return "clock_invalid";
        case RejectReason::Expired: return "expired";
        case RejectReason::ExpiryTooFar: return "expiry_too_far";
        case RejectReason::Busy: return "busy";
        case RejectReason::Cooldown: return "cooldown";
        case RejectReason::TankLow: return "tank_low";
        case RejectReason::LeakDetected: return "leak_detected";
        case RejectReason::SensorFault: return "sensor_fault";
        case RejectReason::DailyLimit: return "daily_limit";
        case RejectReason::Duplicate: return "duplicate";
        case RejectReason::LockedOut: return "locked_out";
        case RejectReason::Paused: return "paused";
        case RejectReason::RunTooLong: return "run_too_long";
        case RejectReason::StorageFault: return "storage_fault";
    }
    return "unknown";
}

const char* faultName(Fault fault) {
    switch (fault) {
        case Fault::None: return "none";
        case Fault::TankLow: return "tank_low";
        case Fault::Leak: return "leak_detected";
        case Fault::Sensor: return "sensor_fault";
        case Fault::Storage: return "storage_fault";
    }
    return "unknown";
}

const char* wateringStateName(WateringState state) {
    switch (state) {
        case WateringState::Idle: return "idle";
        case WateringState::Watering: return "watering";
        case WateringState::Cooldown: return "cooldown";
        case WateringState::Lockout: return "lockout";
    }
    return "unknown";
}

} // namespace plant
