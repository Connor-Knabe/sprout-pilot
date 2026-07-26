#pragma once

#include <stddef.h>
#include <stdint.h>

namespace plant {

struct TelemetryV1 {
    const char* eventId;
    const char* deviceId;
    uint32_t sequence;
    const char* recordedAt;
    const char* firmwareVersion;
    uint16_t moistureRaw;
    float moisturePercent;
    bool tankLow;
    bool leakDetected;
    bool pumpActive;
    const char* sensorStatus;
    const char* faultCode;
};

// Formats the dashboard's TelemetryEnvelopeV1. All string fields are generated
// internally (hex IDs, ISO timestamp, enum names), not arbitrary user input.
bool formatTelemetryV1(char* output, size_t outputSize, const TelemetryV1& telemetry);

} // namespace plant
