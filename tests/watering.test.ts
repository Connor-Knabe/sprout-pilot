import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_POLICY, type WaterCommandInput } from "@/lib/contracts";
import { ApiError } from "@/lib/server/errors";
import type { WaterSafetyContext } from "@/lib/server/plant-repository";
import { assertWateringSafe } from "@/lib/server/watering";

const NOW = new Date("2026-07-25T12:00:00.000Z");

function command(overrides: Partial<WaterCommandInput> = {}): WaterCommandInput {
  return {
    commandId: "019f9727-309c-74e0-9900-aae42606c4f7",
    zoneId: "zone-1",
    doseMl: 50,
    expiresAt: "2026-07-25T12:01:00.000Z",
    ...overrides,
  };
}

function context(
  overrides: Partial<WaterSafetyContext> = {},
): WaterSafetyContext {
  return {
    telemetry: {
      event_id: "device-1:42",
      device_id: "device-1",
      sequence: 42,
      recorded_at: "2026-07-25T11:59:45.000Z",
      received_at: "2026-07-25T11:59:46.000Z",
      firmware_version: "0.1.0",
      moisture_raw: 2100,
      moisture_percent: 36,
      air_temperature_c: null,
      relative_humidity_percent: null,
      light_lux: null,
      tank_low: 0,
      leak_detected: 0,
      pump_active: 0,
      sensor_status: "ok",
      fault_code: null,
    },
    policy: {
      ...DEFAULT_POLICY,
      mode: "manual",
      calibrated: true,
    },
    usedTodayMl: 0,
    lastWateringAt: null,
    ...overrides,
  };
}

function expectApiError(
  run: () => void,
  code: string,
  status = 409,
): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return true;
  });
}

test("accepts a bounded command when all server safety checks pass", () => {
  assert.doesNotThrow(() => assertWateringSafe(command(), context(), NOW));
});

test("rejects demo or missing device telemetry", () => {
  expectApiError(
    () => assertWateringSafe(command(), context({ telemetry: null }), NOW),
    "device_offline",
    503,
  );
});

test("rejects stale device telemetry", () => {
  const stale = context();
  if (!stale.telemetry) throw new Error("test fixture missing telemetry");
  stale.telemetry.received_at = "2026-07-25T11:40:00.000Z";
  expectApiError(
    () => assertWateringSafe(command(), stale, NOW),
    "device_offline",
    503,
  );
});

test("rejects tank, leak, pump, and sensor faults", () => {
  for (const [field, code] of [
    ["tank_low", "tank_low"],
    ["leak_detected", "leak_detected"],
    ["pump_active", "pump_busy"],
  ] as const) {
    const unsafe = context();
    if (!unsafe.telemetry) throw new Error("test fixture missing telemetry");
    unsafe.telemetry[field] = 1;
    expectApiError(
      () => assertWateringSafe(command(), unsafe, NOW),
      code,
    );
  }

  const badSensor = context();
  if (!badSensor.telemetry) throw new Error("test fixture missing telemetry");
  badSensor.telemetry.sensor_status = "fault";
  expectApiError(
    () => assertWateringSafe(command(), badSensor, NOW),
    "controller_fault",
  );
});

test("rejects monitor mode, oversized dose, daily cap, and minimum interval", () => {
  const monitor = context();
  monitor.policy.mode = "monitor";
  expectApiError(
    () => assertWateringSafe(command(), monitor, NOW),
    "watering_disabled",
  );

  expectApiError(
    () => assertWateringSafe(command({ doseMl: 60 }), context(), NOW),
    "dose_limit_exceeded",
  );

  expectApiError(
    () =>
      assertWateringSafe(
        command(),
        context({ usedTodayMl: 225 }),
        NOW,
      ),
    "daily_limit_exceeded",
  );

  expectApiError(
    () =>
      assertWateringSafe(
        command(),
        context({ lastWateringAt: "2026-07-25T10:00:00.000Z" }),
        NOW,
      ),
    "minimum_interval_active",
  );
});
