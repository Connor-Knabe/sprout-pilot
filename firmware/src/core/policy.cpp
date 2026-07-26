#include "core/policy.h"

namespace plant {

WateringPolicy defaultWateringPolicy() {
    WateringPolicy policy = {};
    policy.mode = OperatingMode::Monitor;
    policy.dryThresholdPercent = 30.0F;
    policy.targetMoisturePercent = 45.0F;
    policy.doseMl = 50U;
    policy.minimumSecondsBetweenRuns = 6U * 60U * 60U;
    policy.dailyLimitMl = 250U;
    policy.rainSuppressionEnabled = true;
    policy.calibrated = false;
    return policy;
}

PolicyDecision evaluatePolicy(const WateringPolicy& policy, const PolicyInputs& inputs) {
    if (policy.mode != OperatingMode::Automatic) {
        return PolicyDecision::ModeDisabled;
    }
    if (!policy.calibrated) {
        return PolicyDecision::NotCalibrated;
    }
    if (!inputs.sensorValid) {
        return PolicyDecision::SensorFault;
    }
    if (inputs.moisturePercent >= policy.dryThresholdPercent) {
        return PolicyDecision::NotDry;
    }
    if (inputs.consecutiveDrySamples < 3U) {
        return PolicyDecision::NeedMoreDrySamples;
    }
    if (policy.rainSuppressionEnabled && inputs.weatherFresh && inputs.rainSuppressed) {
        return PolicyDecision::RainSuppressed;
    }
    if (inputs.hasLastRun &&
        (inputs.nowEpoch <= inputs.lastRunEpoch ||
         (inputs.nowEpoch - inputs.lastRunEpoch) < policy.minimumSecondsBetweenRuns)) {
        return PolicyDecision::Cooldown;
    }
    if (static_cast<uint32_t>(inputs.usedTodayMl) + policy.doseMl > policy.dailyLimitMl) {
        return PolicyDecision::DailyLimit;
    }
    return PolicyDecision::Water;
}

} // namespace plant
