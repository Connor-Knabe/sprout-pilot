#include "core/persistent_budget.h"

#include <string.h>

namespace plant {
namespace {

const uint32_t kMagic = 0x504C4E54UL;
const uint16_t kVersion = 1U;

uint32_t checksum(const PersistentBudgetRecord& record) {
    const uint8_t* bytes = reinterpret_cast<const uint8_t*>(&record);
    uint32_t hash = 2166136261UL;
    for (size_t i = 0U; i < offsetof(PersistentBudgetRecord, checksum); ++i) {
        hash ^= bytes[i];
        hash *= 16777619UL;
    }
    return hash;
}

bool allBytesErased(const PersistentBudgetRecord& record) {
    const uint8_t* bytes = reinterpret_cast<const uint8_t*>(&record);
    for (size_t i = 0U; i < sizeof(record); ++i) {
        if (bytes[i] != 0xFFU) {
            return false;
        }
    }
    return true;
}

bool commandIdFieldValid(const char* commandId) {
    return commandId[0] == '\0' || validCommandId(commandId);
}

} // namespace

static_assert(offsetof(PersistentBudgetRecord, checksum) == 56U, "Unexpected budget layout");
static_assert(sizeof(PersistentBudgetRecord) == 60U, "Unexpected budget record size");

PersistentBudgetRecord makePersistentBudgetRecord(
    uint32_t epochDay,
    uint32_t bootCounter,
    uint16_t reservedMl,
    const char* lastCommandId) {
    PersistentBudgetRecord record = {};
    record.magic = kMagic;
    record.version = kVersion;
    record.recordSize = sizeof(PersistentBudgetRecord);
    record.epochDay = epochDay;
    record.bootCounter = bootCounter;
    record.reservedMl = reservedMl;
    if (lastCommandId != 0 && validCommandId(lastCommandId)) {
        memcpy(record.lastCommandId, lastCommandId, kCommandIdLength + 1U);
    }
    record.checksum = checksum(record);
    return record;
}

PersistentRecordStatus inspectPersistentBudgetRecord(const PersistentBudgetRecord& record) {
    if (allBytesErased(record)) {
        return PersistentRecordStatus::Erased;
    }
    const bool valid = record.magic == kMagic &&
        record.version == kVersion &&
        record.recordSize == sizeof(PersistentBudgetRecord) &&
        record.reserved == 0U &&
        record.lastCommandId[kCommandIdLength] == '\0' &&
        commandIdFieldValid(record.lastCommandId) &&
        record.checksum == checksum(record);
    return valid ? PersistentRecordStatus::Valid : PersistentRecordStatus::Corrupt;
}

} // namespace plant
