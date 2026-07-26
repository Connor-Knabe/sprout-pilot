#pragma once

#include <stdint.h>

namespace plant {

struct Calibration {
    uint16_t dryRaw;
    uint16_t wetRaw;
    uint16_t minimumSpan;
    bool calibrated;
};

bool calibrationUsable(const Calibration& calibration);

// Returns a clamped 0-100 value. `valid` is false when endpoints are too close.
float moisturePercent(uint16_t raw, const Calibration& calibration, bool* valid);

} // namespace plant
