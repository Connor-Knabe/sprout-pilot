import {
  DEMO_SCENARIOS,
  DEFAULT_POLICY,
  type DemoScenario,
  type DashboardSnapshot,
  type PlantAlert,
  type WateringPolicy,
  PROTOTYPE_ZONE_ID,
} from "@/lib/contracts";

const DEMO_MOISTURE_VALUES = [
  44, 43.7, 43.2, 42.9, 42.5, 42, 41.5, 41.1, 40.6, 40.2, 39.7, 39.2,
  38.8, 46.5, 45.8, 44.9, 44, 43.1, 42.2, 41.3, 40.4, 39.3, 38.1, 37,
] as const;

interface MockDashboardOptions {
  now?: Date;
  policy?: WateringPolicy;
  scenario?: DemoScenario;
}

export function isDemoScenario(value: string | null): value is DemoScenario {
  return (
    value !== null &&
    (DEMO_SCENARIOS as readonly string[]).includes(value)
  );
}

function shiftMoistureReadings(target: number): number[] {
  const current = DEMO_MOISTURE_VALUES.at(-1) ?? target;
  const offset = target - current;
  return DEMO_MOISTURE_VALUES.map((value) =>
    Math.min(100, Math.max(0, Number((value + offset).toFixed(1)))),
  );
}

export function buildMockDashboard({
  now = new Date(),
  policy = DEFAULT_POLICY,
  scenario = "healthy",
}: MockDashboardOptions = {}): DashboardSnapshot {
  const minute = 60_000;
  const halfHour = 30 * minute;
  const pumpActive = scenario === "watering";
  const tankLow = scenario === "tank-low";
  const leakDetected = scenario === "leak";
  const sensorFault = scenario === "sensor-fault";
  const offline = scenario === "offline";
  const latestReadingAt = offline
    ? new Date(now.getTime() - 2 * 60 * minute)
    : now;
  const scenarioMoisture = scenario === "dry" ? 24 : 37;
  const moistureValues = shiftMoistureReadings(scenarioMoisture);
  const readings = moistureValues.map((moisturePercent, index) => ({
    recordedAt: new Date(
      latestReadingAt.getTime() -
        (moistureValues.length - 1 - index) * halfHour,
    ).toISOString(),
    moisturePercent,
  }));
  const lastWateredAt = new Date(
    now.getTime() - (scenario === "dry" ? 10 : 5.5) * 60 * minute,
  ).toISOString();
  const nextEligibleAt = new Date(
    Date.parse(lastWateredAt) + policy.minimumHoursBetweenRuns * 60 * minute,
  ).toISOString();
  const weatherHour = new Date(now);
  weatherHour.setUTCMinutes(0, 0, 0);

  const scenarioAlert: PlantAlert | null = (() => {
    const createdAt = new Date(now.getTime() - 4 * minute).toISOString();
    switch (scenario) {
      case "dry":
        return {
          id: "demo-dry-soil",
          createdAt,
          severity: "warning",
          title: "Soil is below the dry threshold",
          detail: "Review the trend before sending an attended manual dose.",
          acknowledged: false,
        };
      case "tank-low":
        return {
          id: "demo-tank-low",
          createdAt,
          severity: "critical",
          title: "Reservoir is low",
          detail: "The tank switch blocks the next pump start.",
          acknowledged: false,
        };
      case "leak":
        return {
          id: "demo-leak",
          createdAt,
          severity: "critical",
          title: "Leak detected",
          detail: "Pump output is locked until the tray and tubing are inspected.",
          acknowledged: false,
        };
      case "sensor-fault":
        return {
          id: "demo-sensor-fault",
          createdAt,
          severity: "critical",
          title: "Soil probe fault",
          detail: "Watering is inhibited until the probe signal is valid again.",
          acknowledged: false,
        };
      case "offline":
        return {
          id: "demo-offline",
          createdAt,
          severity: "warning",
          title: "Controller is offline",
          detail: "Last telemetry is more than one hour old. Local safety still applies.",
          acknowledged: false,
        };
      case "rainy":
        return {
          id: "demo-rain",
          createdAt,
          severity: "info",
          title: "Rain suppression active",
          detail: "Forecast context can delay watering, but never starts the pump.",
          acknowledged: false,
        };
      case "healthy":
      case "watering":
        return null;
    }
  })();

  return {
    device: {
      id: "demo-device",
      name: "Prototype controller (demo)",
      connection: offline ? "offline" : "online",
      lastSeenAt: new Date(
        now.getTime() - (offline ? 2 * 60 * minute : 45_000),
      ).toISOString(),
      firmwareVersion: "demo-0.1.0",
    },
    zone: {
      id: PROTOTYPE_ZONE_ID,
      name: "Prototype pot",
      plantName: "Demo basil",
      moisturePercent: scenarioMoisture,
      moistureRaw: scenario === "dry" ? 2_640 : sensorFault ? 65_535 : 2_185,
      sensorStatus: sensorFault ? "fault" : offline ? "stale" : "ok",
      airTemperatureC: 23.4,
      relativeHumidityPercent: 51,
      lightLux: 8_420,
      tankLow,
      leakDetected,
      pumpActive,
      lastWateredAt,
      nextEligibleAt,
    },
    policy: { ...policy },
    weather: {
      observedAt: weatherHour.toISOString(),
      temperatureC: 24.1,
      relativeHumidityPercent: 49,
      precipitationProbabilityPercent: scenario === "rainy" ? 88 : 20,
      precipitationNext12HoursMm: scenario === "rainy" ? 8.2 : 0.3,
      condition:
        scenario === "rainy"
          ? "Heavy rain expected (mock)"
          : "Partly cloudy (mock)",
      wateringSuppressed: scenario === "rainy",
    },
    readings,
    wateringEvents: [
      ...(pumpActive
        ? [
            {
              id: "demo-watering-active",
              startedAt: new Date(now.getTime() - 18_000).toISOString(),
              completedAt: null,
              requestedMl: policy.doseMl,
              deliveredMl: null,
              reason: "manual" as const,
              status: "running" as const,
            },
          ]
        : []),
      {
        id: "demo-watering-1",
        startedAt: lastWateredAt,
        completedAt: new Date(Date.parse(lastWateredAt) + 42_000).toISOString(),
        requestedMl: 50,
        deliveredMl: null,
        reason: "manual",
        status: "completed",
      },
    ],
    alerts: [
      ...(scenarioAlert ? [scenarioAlert] : []),
      {
        id: "demo-mode",
        createdAt: new Date(now.getTime() - 2 * minute).toISOString(),
        severity: "info",
        title: "Demo data active",
        detail: "These seeded readings never authorize a real watering command.",
        acknowledged: false,
      },
    ],
  };
}
