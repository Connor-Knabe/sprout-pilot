#pragma once

#include <stddef.h>
#include <stdint.h>

namespace plant {

static const size_t kCommandIdLength = 36U;
static const size_t kMaximumCommandLength = 63U;

struct WaterCommand {
    char commandId[kCommandIdLength + 1U];
    uint16_t doseMl;
    uint32_t expiresAtEpoch;
};

enum class CommandParseError {
    None,
    Empty,
    TooLong,
    BadFieldCount,
    InvalidDose,
    InvalidExpiry
};

CommandParseError parseWaterCommand(const char* input, WaterCommand* command);
bool validCommandId(const char* commandId);

} // namespace plant
