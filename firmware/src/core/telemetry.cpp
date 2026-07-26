#include "core/telemetry.h"

#include <stdio.h>

namespace plant {

bool formatTelemetryV1(char* output, size_t outputSize, const TelemetryV1& telemetry) {
    if (output == 0 || outputSize == 0U || telemetry.eventId == 0 || telemetry.deviceId == 0 ||
        telemetry.recordedAt == 0 || telemetry.firmwareVersion == 0 ||
        telemetry.sensorStatus == 0) {
        return false;
    }

    char faultJson[40] = "null";
    if (telemetry.faultCode != 0) {
        const int faultWritten = snprintf(
            faultJson,
            sizeof(faultJson),
            "\"%s\"",
            telemetry.faultCode);
        if (faultWritten < 0 || static_cast<size_t>(faultWritten) >= sizeof(faultJson)) {
            return false;
        }
    }

    const int written = snprintf(
        output,
        outputSize,
        "{\"version\":1,\"eventId\":\"%s\",\"deviceId\":\"%s\","
        "\"sequence\":%lu,\"recordedAt\":\"%s\",\"firmwareVersion\":\"%s\","
        "\"moistureRaw\":%u,\"moisturePercent\":%.1f,"
        "\"airTemperatureC\":null,\"relativeHumidityPercent\":null,\"lightLux\":null,"
        "\"tankLow\":%s,\"leakDetected\":%s,\"pumpActive\":%s,"
        "\"sensorStatus\":\"%s\",\"faultCode\":%s}",
        telemetry.eventId,
        telemetry.deviceId,
        static_cast<unsigned long>(telemetry.sequence),
        telemetry.recordedAt,
        telemetry.firmwareVersion,
        static_cast<unsigned int>(telemetry.moistureRaw),
        static_cast<double>(telemetry.moisturePercent),
        telemetry.tankLow ? "true" : "false",
        telemetry.leakDetected ? "true" : "false",
        telemetry.pumpActive ? "true" : "false",
        telemetry.sensorStatus,
        faultJson);
    return written >= 0 && static_cast<size_t>(written) < outputSize;
}

} // namespace plant
