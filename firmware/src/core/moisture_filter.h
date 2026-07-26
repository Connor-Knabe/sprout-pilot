#pragma once

#include <stddef.h>
#include <stdint.h>

namespace plant {

class MoistureFilter {
public:
    static const size_t kWindowSize = 5U;

    explicit MoistureFilter(float smoothingFactor = 0.35F);

    void reset();
    uint16_t add(uint16_t raw);
    bool initialized() const;
    uint16_t value() const;

private:
    uint16_t median() const;

    uint16_t samples_[kWindowSize];
    size_t count_;
    size_t next_;
    float smoothingFactor_;
    float smoothed_;
    bool initialized_;
};

} // namespace plant
