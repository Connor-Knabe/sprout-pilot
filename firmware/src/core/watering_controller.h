#pragma once

#include <stdint.h>

#include "core/command_parser.h"
#include "core/policy.h"

namespace plant {

struct SafetyInputs {
    bool tankLow;
    bool leakDetected;
    bool sensorValid;
};

struct ControllerConfig {
    uint16_t minimumDoseMl;
    uint16_t maximumDoseMl;
    uint16_t dailyLimitMl;
    uint16_t pumpMlPerMinute;
    uint32_t maximumRunMs;
    uint32_t cooldownMs;
    uint32_t maximumCommandTtlSeconds;
    uint32_t minimumValidEpoch;
};

enum class WateringState {
    Idle,
    Watering,
    Cooldown,
    Lockout
};

enum class Fault {
    None,
    TankLow,
    Leak,
    Sensor,
    Storage
};

enum class RejectReason {
    None,
    InvalidCommandId,
    DoseOutOfRange,
    ClockInvalid,
    Expired,
    ExpiryTooFar,
    Busy,
    Cooldown,
    TankLow,
    LeakDetected,
    SensorFault,
    DailyLimit,
    Duplicate,
    LockedOut,
    Paused,
    RunTooLong,
    StorageFault
};

struct CommandResult {
    bool accepted;
    RejectReason reason;
    uint32_t runDurationMs;
};

struct BudgetSnapshot {
    uint32_t epochDay;
    uint16_t reservedMl;
    char lastCommandId[kCommandIdLength + 1U];
};

ControllerConfig defaultControllerConfig();
const char* rejectReasonName(RejectReason reason);
const char* faultName(Fault fault);
const char* wateringStateName(WateringState state);

class WateringController {
public:
    explicit WateringController(const ControllerConfig& config);

    CommandResult requestManual(
        const WaterCommand& command,
        uint32_t nowEpoch,
        uint32_t nowMs,
        const SafetyInputs& safety);
    void tick(uint32_t nowEpoch, uint32_t nowMs, const SafetyInputs& safety);
    bool clearLockout(const SafetyInputs& safety);
    void latchStorageFault();

    void setMode(OperatingMode mode);
    OperatingMode mode() const;
    WateringState state() const;
    Fault fault() const;
    bool pumpRequested() const;
    uint16_t activeDoseMl() const;
    uint32_t runDurationMs() const;

    void restoreBudget(uint32_t epochDay, uint16_t reservedMl, const char* lastCommandId);
    BudgetSnapshot budgetSnapshot() const;

private:
    void observeSafety(const SafetyInputs& safety);
    void enterLockout(Fault fault);
    void updateBudgetDay(uint32_t nowEpoch);
    CommandResult reject(RejectReason reason) const;

    ControllerConfig config_;
    OperatingMode mode_;
    WateringState state_;
    Fault fault_;
    uint32_t startedAtMs_;
    uint32_t cooldownStartedAtMs_;
    uint32_t runDurationMs_;
    uint16_t activeDoseMl_;
    uint32_t budgetEpochDay_;
    uint16_t reservedTodayMl_;
    bool budgetInitialized_;
    char lastCommandId_[kCommandIdLength + 1U];
};

} // namespace plant
