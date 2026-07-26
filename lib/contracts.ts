export const PROTOTYPE_ZONE_ID = "zone-1";

export const DEMO_SCENARIOS = [
  "healthy",
  "dry",
  "watering",
  "rainy",
  "tank-low",
  "leak",
  "sensor-fault",
  "offline",
] as const;

export type DemoScenario = (typeof DEMO_SCENARIOS)[number];

export type OperatingMode =
  | "monitor"
  | "manual"
  | "automatic"
  | "paused"
  | "lockout";

export type DeviceConnection = "online" | "offline" | "stale";
export type SensorStatus = "ok" | "stale" | "fault";
export type AlertSeverity = "info" | "warning" | "critical";
export type WateringReason = "manual" | "moisture";

export interface TelemetryEnvelopeV1 {
  version: 1;
  eventId: string;
  deviceId: string;
  sequence: number;
  recordedAt: string;
  firmwareVersion: string;
  moistureRaw: number;
  moisturePercent: number;
  airTemperatureC: number | null;
  relativeHumidityPercent: number | null;
  lightLux: number | null;
  tankLow: boolean;
  leakDetected: boolean;
  pumpActive: boolean;
  sensorStatus: SensorStatus;
  faultCode: string | null;
}

export interface MoisturePoint {
  recordedAt: string;
  moisturePercent: number;
}

export interface WateringEvent {
  id: string;
  startedAt: string;
  completedAt: string | null;
  requestedMl: number;
  deliveredMl: number | null;
  reason: WateringReason;
  status: "queued" | "running" | "completed" | "rejected" | "interrupted";
}

export interface PlantAlert {
  id: string;
  createdAt: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  acknowledged: boolean;
}

export interface WeatherSnapshot {
  observedAt: string;
  temperatureC: number;
  relativeHumidityPercent: number;
  precipitationProbabilityPercent: number;
  precipitationNext12HoursMm: number;
  condition: string;
  wateringSuppressed: boolean;
}

export interface WateringPolicy {
  mode: OperatingMode;
  dryThresholdPercent: number;
  targetMoisturePercent: number;
  doseMl: number;
  minimumHoursBetweenRuns: number;
  dailyLimitMl: number;
  rainSuppressionEnabled: boolean;
  calibrated: boolean;
}

export interface DashboardSnapshot {
  device: {
    id: string;
    name: string;
    connection: DeviceConnection;
    lastSeenAt: string;
    firmwareVersion: string;
  };
  zone: {
    id: string;
    name: string;
    plantName: string;
    moisturePercent: number;
    moistureRaw: number;
    sensorStatus: SensorStatus;
    airTemperatureC: number | null;
    relativeHumidityPercent: number | null;
    lightLux: number | null;
    tankLow: boolean;
    leakDetected: boolean;
    pumpActive: boolean;
    lastWateredAt: string | null;
    nextEligibleAt: string | null;
  };
  policy: WateringPolicy;
  weather: WeatherSnapshot;
  readings: MoisturePoint[];
  wateringEvents: WateringEvent[];
  alerts: PlantAlert[];
}

export interface WaterCommandInput {
  commandId: string;
  zoneId: string;
  doseMl: number;
  expiresAt: string;
}

export interface WaterCommandResult {
  commandId: string;
  status: "accepted" | "rejected";
  reason: string | null;
  wateringEvent: WateringEvent | null;
}

export interface PolicyUpdateInput {
  mode: OperatingMode;
  dryThresholdPercent: number;
  targetMoisturePercent: number;
  doseMl: number;
  minimumHoursBetweenRuns: number;
  dailyLimitMl: number;
  rainSuppressionEnabled: boolean;
}

export const DEFAULT_POLICY: WateringPolicy = {
  mode: "monitor",
  dryThresholdPercent: 30,
  targetMoisturePercent: 45,
  doseMl: 50,
  minimumHoursBetweenRuns: 6,
  dailyLimitMl: 250,
  rainSuppressionEnabled: true,
  calibrated: false,
};
