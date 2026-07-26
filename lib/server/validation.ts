import {
  type OperatingMode,
  type PolicyUpdateInput,
  PROTOTYPE_ZONE_ID,
  type SensorStatus,
  type TelemetryEnvelopeV1,
  type WaterCommandInput,
} from "@/lib/contracts";
import { ApiError } from "./errors";

const SENSOR_STATUSES = new Set<SensorStatus>(["ok", "stale", "fault"]);
const USER_MODES = new Set<OperatingMode>([
  "monitor",
  "manual",
  "automatic",
  "paused",
]);
const MAX_COMMAND_TTL_MS = 5 * 60_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(field: string, expected: string): never {
  throw new ApiError(
    400,
    "validation_error",
    `Invalid \`${field}\`: expected ${expected}.`,
  );
}

function requiredString(
  body: Record<string, unknown>,
  field: string,
  maxLength: number,
): string {
  const value = body[field];
  if (typeof value !== "string") {
    return fail(field, `a non-empty string up to ${maxLength} characters`);
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    return fail(field, `a non-empty string up to ${maxLength} characters`);
  }
  return trimmed;
}

function nullableString(
  body: Record<string, unknown>,
  field: string,
  maxLength: number,
): string | null {
  const value = body[field];
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return fail(field, `null or a string up to ${maxLength} characters`);
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    return fail(field, `null or a non-empty string up to ${maxLength} characters`);
  }
  return trimmed;
}

function identifier(
  body: Record<string, unknown>,
  field: string,
  maxLength: number,
): string {
  const value = requiredString(body, field, maxLength);
  if (!/^[a-zA-Z0-9._:-]+$/.test(value)) {
    return fail(
      field,
      "an identifier containing only letters, numbers, `.`, `_`, `:`, or `-`",
    );
  }
  return value;
}

function finiteNumber(
  body: Record<string, unknown>,
  field: string,
  minimum: number,
  maximum: number,
): number {
  const value = body[field];
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    return fail(field, `a number from ${minimum} through ${maximum}`);
  }
  return value;
}

function integer(
  body: Record<string, unknown>,
  field: string,
  minimum: number,
  maximum: number,
): number {
  const value = finiteNumber(body, field, minimum, maximum);
  if (!Number.isInteger(value)) {
    return fail(field, `an integer from ${minimum} through ${maximum}`);
  }
  return value;
}

function nullableNumber(
  body: Record<string, unknown>,
  field: string,
  minimum: number,
  maximum: number,
): number | null {
  if (body[field] === null) {
    return null;
  }
  return finiteNumber(body, field, minimum, maximum);
}

function boolean(body: Record<string, unknown>, field: string): boolean {
  const value = body[field];
  if (typeof value !== "boolean") {
    return fail(field, "a boolean");
  }
  return value;
}

function isoDate(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) {
    return fail(field, "a valid ISO-8601 date-time string");
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return fail(field, "a valid ISO-8601 date-time string");
  }
  return new Date(timestamp).toISOString();
}

export function validateTelemetry(
  body: Record<string, unknown>,
  now = new Date(),
): TelemetryEnvelopeV1 {
  if (body.version !== 1) {
    fail("version", "the number 1");
  }

  const recordedAt = isoDate(body, "recordedAt");
  if (Date.parse(recordedAt) > now.getTime() + 5 * 60_000) {
    fail("recordedAt", "a time no more than 5 minutes in the future");
  }

  const sensorStatus = body.sensorStatus;
  if (
    typeof sensorStatus !== "string" ||
    !SENSOR_STATUSES.has(sensorStatus as SensorStatus)
  ) {
    fail("sensorStatus", "one of: ok, stale, fault");
  }

  return {
    version: 1,
    eventId: identifier(body, "eventId", 110),
    deviceId: identifier(body, "deviceId", 128),
    sequence: integer(body, "sequence", 0, Number.MAX_SAFE_INTEGER),
    recordedAt,
    firmwareVersion: requiredString(body, "firmwareVersion", 64),
    moistureRaw: integer(body, "moistureRaw", 0, 65_535),
    moisturePercent: finiteNumber(body, "moisturePercent", 0, 100),
    airTemperatureC: nullableNumber(body, "airTemperatureC", -50, 100),
    relativeHumidityPercent: nullableNumber(
      body,
      "relativeHumidityPercent",
      0,
      100,
    ),
    lightLux: nullableNumber(body, "lightLux", 0, 500_000),
    tankLow: boolean(body, "tankLow"),
    leakDetected: boolean(body, "leakDetected"),
    pumpActive: boolean(body, "pumpActive"),
    sensorStatus: sensorStatus as SensorStatus,
    faultCode: nullableString(body, "faultCode", 64),
  };
}

export function validateWaterCommand(
  body: Record<string, unknown>,
  now = new Date(),
  enforceExpiry = true,
): WaterCommandInput {
  const zoneId = requiredString(body, "zoneId", 64);
  if (zoneId !== PROTOTYPE_ZONE_ID) {
    throw new ApiError(
      404,
      "zone_not_found",
      `Prototype supports only zone \`${PROTOTYPE_ZONE_ID}\`.`,
    );
  }

  const expiresAt = isoDate(body, "expiresAt");
  const expiresAtMs = Date.parse(expiresAt);
  if (enforceExpiry && expiresAtMs <= now.getTime()) {
    throw new ApiError(410, "command_expired", "Water command has expired.");
  }
  if (expiresAtMs > now.getTime() + MAX_COMMAND_TTL_MS) {
    fail("expiresAt", "a time no more than 5 minutes in the future");
  }

  return {
    commandId: validateCommandId(requiredString(body, "commandId", 36)),
    zoneId,
    doseMl: integer(body, "doseMl", 10, 100),
    expiresAt,
  };
}

export function assertWaterCommandFresh(
  command: WaterCommandInput,
  now = new Date(),
): void {
  if (Date.parse(command.expiresAt) <= now.getTime()) {
    throw new ApiError(410, "command_expired", "Water command has expired.");
  }
}

function validateCommandId(commandId: string): string {
  if (!UUID_PATTERN.test(commandId)) {
    fail("commandId", "a UUID string");
  }
  return commandId.toLowerCase();
}

export function validatePolicyUpdate(
  body: Record<string, unknown>,
): PolicyUpdateInput {
  const mode = body.mode;
  if (typeof mode !== "string" || !USER_MODES.has(mode as OperatingMode)) {
    fail("mode", "one of: monitor, manual, automatic, paused");
  }

  const dryThresholdPercent = finiteNumber(
    body,
    "dryThresholdPercent",
    5,
    70,
  );
  const targetMoisturePercent = finiteNumber(
    body,
    "targetMoisturePercent",
    10,
    90,
  );
  if (targetMoisturePercent < dryThresholdPercent + 5) {
    fail(
      "targetMoisturePercent",
      "at least 5 percentage points above dryThresholdPercent",
    );
  }

  const doseMl = integer(body, "doseMl", 10, 100);
  const dailyLimitMl = integer(body, "dailyLimitMl", 10, 2_000);
  if (dailyLimitMl < doseMl) {
    fail("dailyLimitMl", "a value greater than or equal to doseMl");
  }

  return {
    mode: mode as OperatingMode,
    dryThresholdPercent,
    targetMoisturePercent,
    doseMl,
    minimumHoursBetweenRuns: finiteNumber(
      body,
      "minimumHoursBetweenRuns",
      1,
      72,
    ),
    dailyLimitMl,
    rainSuppressionEnabled: boolean(body, "rainSuppressionEnabled"),
  };
}

export function validateAlertId(value: string): string {
  const id = value.trim();
  if (!id || id.length > 128 || !/^[a-zA-Z0-9._:-]+$/.test(id)) {
    throw new ApiError(
      400,
      "validation_error",
      "Alert id must contain 1 through 128 safe identifier characters.",
    );
  }
  return id;
}
