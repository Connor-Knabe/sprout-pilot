import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_SCENARIOS } from "@/lib/contracts";
import {
  buildMockDashboard,
  isDemoScenario,
} from "@/lib/server/mock-dashboard";

const NOW = new Date("2026-07-25T12:00:00.000Z");

for (const scenario of DEMO_SCENARIOS) {
  test(`builds ${scenario} as read-only mock data`, () => {
    const snapshot = buildMockDashboard({ now: NOW, scenario });

    assert.equal(snapshot.device.id, "demo-device");
    assert.match(snapshot.device.firmwareVersion, /^demo-/);
    assert.equal(snapshot.readings.length, 24);
    assert.ok(
      snapshot.alerts.some((alert) => alert.id === "demo-mode"),
    );
    assert.ok(snapshot.wateringEvents.every((event) => event.deliveredMl === null));
  });
}

test("dry, weather, and active-watering scenarios expose distinct states", () => {
  const dry = buildMockDashboard({ now: NOW, scenario: "dry" });
  const rainy = buildMockDashboard({ now: NOW, scenario: "rainy" });
  const watering = buildMockDashboard({ now: NOW, scenario: "watering" });

  assert.ok(dry.zone.moisturePercent < dry.policy.dryThresholdPercent);
  assert.equal(rainy.weather.wateringSuppressed, true);
  assert.ok(rainy.weather.precipitationNext12HoursMm > 0);
  assert.equal(watering.zone.pumpActive, true);
  assert.equal(watering.wateringEvents[0]?.status, "running");
});

test("fault scenarios set the matching safety signal", () => {
  assert.equal(
    buildMockDashboard({ now: NOW, scenario: "tank-low" }).zone.tankLow,
    true,
  );
  assert.equal(
    buildMockDashboard({ now: NOW, scenario: "leak" }).zone.leakDetected,
    true,
  );
  assert.equal(
    buildMockDashboard({ now: NOW, scenario: "sensor-fault" }).zone.sensorStatus,
    "fault",
  );
  const offline = buildMockDashboard({ now: NOW, scenario: "offline" });
  assert.equal(offline.device.connection, "offline");
  assert.ok(
    Date.parse(offline.readings.at(-1)?.recordedAt ?? "") <=
      NOW.getTime() - 2 * 60 * 60_000,
  );
});

test("validates demo scenario names", () => {
  assert.equal(isDemoScenario("healthy"), true);
  assert.equal(isDemoScenario("sensor-fault"), true);
  assert.equal(isDemoScenario("unknown"), false);
  assert.equal(isDemoScenario(null), false);
});
