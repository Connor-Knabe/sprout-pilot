#include "core/calibration.h"

namespace plant {

bool calibrationUsable(const Calibration& calibration) {
    const uint16_t span = calibration.dryRaw > calibration.wetRaw
        ? static_cast<uint16_t>(calibration.dryRaw - calibration.wetRaw)
        : static_cast<uint16_t>(calibration.wetRaw - calibration.dryRaw);
    return span >= calibration.minimumSpan;
}

float moisturePercent(uint16_t raw, const Calibration& calibration, bool* valid) {
    const bool usable = calibrationUsable(calibration);
    if (valid != 0) {
        *valid = usable;
    }
    if (!usable) {
        return 0.0F;
    }

    const float numerator = static_cast<float>(raw) - static_cast<float>(calibration.dryRaw);
    const float denominator = static_cast<float>(calibration.wetRaw) -
        static_cast<float>(calibration.dryRaw);
    float percent = (numerator * 100.0F) / denominator;
    if (percent < 0.0F) {
        percent = 0.0F;
    } else if (percent > 100.0F) {
        percent = 100.0F;
    }
    return percent;
}

} // namespace plant
