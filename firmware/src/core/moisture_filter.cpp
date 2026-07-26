#include "core/moisture_filter.h"

namespace plant {

MoistureFilter::MoistureFilter(float smoothingFactor)
    : samples_{0U, 0U, 0U, 0U, 0U},
      count_(0U),
      next_(0U),
      smoothingFactor_(smoothingFactor),
      smoothed_(0.0F),
      initialized_(false) {
    if (smoothingFactor_ <= 0.0F || smoothingFactor_ > 1.0F) {
        smoothingFactor_ = 0.35F;
    }
}

void MoistureFilter::reset() {
    count_ = 0U;
    next_ = 0U;
    smoothed_ = 0.0F;
    initialized_ = false;
}

uint16_t MoistureFilter::add(uint16_t raw) {
    samples_[next_] = raw;
    next_ = (next_ + 1U) % kWindowSize;
    if (count_ < kWindowSize) {
        ++count_;
    }

    const float currentMedian = static_cast<float>(median());
    if (!initialized_) {
        smoothed_ = currentMedian;
        initialized_ = true;
    } else {
        smoothed_ += smoothingFactor_ * (currentMedian - smoothed_);
    }
    return value();
}

bool MoistureFilter::initialized() const {
    return initialized_;
}

uint16_t MoistureFilter::value() const {
    if (!initialized_) {
        return 0U;
    }
    return static_cast<uint16_t>(smoothed_ + 0.5F);
}

uint16_t MoistureFilter::median() const {
    uint16_t sorted[kWindowSize] = {0U, 0U, 0U, 0U, 0U};
    for (size_t i = 0U; i < count_; ++i) {
        sorted[i] = samples_[i];
    }
    for (size_t i = 1U; i < count_; ++i) {
        const uint16_t candidate = sorted[i];
        size_t position = i;
        while (position > 0U && sorted[position - 1U] > candidate) {
            sorted[position] = sorted[position - 1U];
            --position;
        }
        sorted[position] = candidate;
    }

    if ((count_ % 2U) == 1U) {
        return sorted[count_ / 2U];
    }
    const uint32_t pair = static_cast<uint32_t>(sorted[(count_ / 2U) - 1U]) +
        static_cast<uint32_t>(sorted[count_ / 2U]);
    return static_cast<uint16_t>(pair / 2U);
}

} // namespace plant
