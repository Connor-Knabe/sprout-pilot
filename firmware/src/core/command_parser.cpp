#include "core/command_parser.h"

#include <limits.h>
#include <string.h>

namespace plant {
namespace {

bool parseUnsigned(const char* begin, const char* end, uint32_t maximum, uint32_t* value) {
    if (begin == end || value == 0) {
        return false;
    }
    if ((end - begin) > 1 && *begin == '0') {
        return false;
    }

    uint32_t parsed = 0U;
    for (const char* cursor = begin; cursor != end; ++cursor) {
        if (*cursor < '0' || *cursor > '9') {
            return false;
        }
        const uint32_t digit = static_cast<uint32_t>(*cursor - '0');
        if (parsed > ((maximum - digit) / 10U)) {
            return false;
        }
        parsed = (parsed * 10U) + digit;
    }
    *value = parsed;
    return true;
}

bool isHex(char value) {
    return (value >= '0' && value <= '9') ||
        (value >= 'a' && value <= 'f') ||
        (value >= 'A' && value <= 'F');
}

} // namespace

bool validCommandId(const char* commandId) {
    if (commandId == 0) {
        return false;
    }
    for (size_t i = 0U; i < kCommandIdLength; ++i) {
        if (commandId[i] == '\0') {
            return false;
        }
        const bool hyphenPosition = i == 8U || i == 13U || i == 18U || i == 23U;
        if (hyphenPosition ? commandId[i] != '-' : !isHex(commandId[i])) {
            return false;
        }
    }
    return commandId[kCommandIdLength] == '\0';
}

CommandParseError parseWaterCommand(const char* input, WaterCommand* command) {
    if (input == 0 || command == 0 || *input == '\0') {
        return CommandParseError::Empty;
    }

    const size_t length = strlen(input);
    if (length > kMaximumCommandLength) {
        return CommandParseError::TooLong;
    }

    const char* firstSeparator = strchr(input, '|');
    const char* secondSeparator = firstSeparator == 0 ? 0 : strchr(firstSeparator + 1, '|');
    if (firstSeparator == 0 || secondSeparator == 0 || strchr(secondSeparator + 1, '|') != 0) {
        return CommandParseError::BadFieldCount;
    }

    const size_t commandIdLength = static_cast<size_t>(firstSeparator - input);
    if (commandIdLength != kCommandIdLength) {
        return CommandParseError::BadFieldCount;
    }

    WaterCommand parsed = {};
    memcpy(parsed.commandId, input, kCommandIdLength);
    parsed.commandId[kCommandIdLength] = '\0';

    uint32_t dose = 0U;
    if (!parseUnsigned(firstSeparator + 1, secondSeparator, UINT16_MAX, &dose)) {
        return CommandParseError::InvalidDose;
    }
    parsed.doseMl = static_cast<uint16_t>(dose);

    const char* end = input + length;
    if (!parseUnsigned(secondSeparator + 1, end, UINT32_MAX, &parsed.expiresAtEpoch)) {
        return CommandParseError::InvalidExpiry;
    }

    *command = parsed;
    return CommandParseError::None;
}

} // namespace plant
