#pragma once

#include <stdint.h>

namespace plant {

enum class OperatingMode {
    Monitor,
    Manual,
    Automatic,
    Paused,
    Lockout
};

struct WateringPolicy {
    OperatingMode mode;
    float dryThresholdPercent;
    float targetMoisturePercent;
    uint16_t doseMl;
    uint32_t minimumSecondsBetweenRuns;
    uint16_t dailyLimitMl;
    bool rainSuppressionEnabled;
    bool calibrated;
};

struct PolicyInputs {
    bool sensorValid;
    float moisturePercent;
    uint8_t consecutiveDrySamples;
    bool weatherFresh;
    bool rainSuppressed;
    bool hasLastRun;
    uint32_t lastRunEpoch;
    uint32_t nowEpoch;
    uint16_t usedTodayMl;
};

enum class PolicyDecision {
    Water,
    ModeDisabled,
    NotCalibrated,
    SensorFault,
    NotDry,
    NeedMoreDrySamples,
    RainSuppressed,
    Cooldown,
    DailyLimit
};

WateringPolicy defaultWateringPolicy();
PolicyDecision evaluatePolicy(const WateringPolicy& policy, const PolicyInputs& inputs);

} // namespace plant
