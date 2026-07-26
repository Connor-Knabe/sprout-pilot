#pragma once

#include <stddef.h>
#include <stdint.h>

#include "core/command_parser.h"

namespace plant {

struct PersistentBudgetRecord {
    uint32_t magic;
    uint16_t version;
    uint16_t recordSize;
    uint32_t epochDay;
    uint32_t bootCounter;
    uint16_t reservedMl;
    char lastCommandId[kCommandIdLength + 1U];
    uint8_t reserved;
    uint32_t checksum;
};

enum class PersistentRecordStatus {
    Erased,
    Valid,
    Corrupt
};

PersistentBudgetRecord makePersistentBudgetRecord(
    uint32_t epochDay,
    uint32_t bootCounter,
    uint16_t reservedMl,
    const char* lastCommandId);
PersistentRecordStatus inspectPersistentBudgetRecord(const PersistentBudgetRecord& record);

} // namespace plant
