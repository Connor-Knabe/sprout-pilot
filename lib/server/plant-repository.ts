import type {
  AlertSeverity,
  DashboardSnapshot,
  DeviceConnection,
  OperatingMode,
  PlantAlert,
  PolicyUpdateInput,
  SensorStatus,
  TelemetryEnvelopeV1,
  WaterCommandInput,
  WaterCommandResult,
  WateringEvent,
  WateringPolicy,
  WateringReason,
  WeatherSnapshot,
} from "@/lib/contracts";
import {
  DEFAULT_POLICY,
  PROTOTYPE_ZONE_ID,
} from "@/lib/contracts";
import type {
  D1DatabaseBinding,
  D1PreparedStatementLike,
  D1ResultLike,
} from "@/db";

interface TelemetryRow {
  event_id: string;
  device_id: string;
  sequence: number;
  recorded_at: string;
  received_at: string;
  firmware_version: string;
  moisture_raw: number;
  moisture_percent: number;
  air_temperature_c: number | null;
  relative_humidity_percent: number | null;
  light_lux: number | null;
  tank_low: number;
  leak_detected: number;
  pump_active: number;
  sensor_status: SensorStatus;
  fault_code: string | null;
}

interface PolicyRow {
  zone_id: string;
  mode: OperatingMode;
  dry_threshold_percent: number;
  target_moisture_percent: number;
  dose_ml: number;
  minimum_hours_between_runs: number;
  daily_limit_ml: number;
  rain_suppression_enabled: number;
  calibrated: number;
}

interface WateringRow {
  id: string;
  command_id: string;
  started_at: string;
  completed_at: string | null;
  requested_ml: number;
  delivered_ml: number | null;
  reason: WateringReason;
  status: WateringEvent["status"];
  rejection_reason: string | null;
}

interface AlertRow {
  id: string;
  created_at: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  acknowledged: number;
}

interface WeatherRow {
  observed_at: string;
  temperature_c: number;
  relative_humidity_percent: number;
  precipitation_probability_percent: number;
  precipitation_next_12_hours_mm: number;
  condition: string;
  watering_suppressed: number;
}

interface MoistureRow {
  recorded_at: string;
  moisture_percent: number;
}

interface DailyUsageRow {
  total_ml: number | null;
}

interface LastWateringRow {
  last_started_at: string | null;
}

interface TelemetryAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
}

const OPERATING_MODES = new Set<OperatingMode>([
  "monitor",
  "manual",
  "automatic",
  "paused",
  "lockout",
]);

function statement(
  db: D1DatabaseBinding,
  sql: string,
  values: unknown[] = [],
): D1PreparedStatementLike {
  const prepared = db.prepare(sql);
  return values.length ? prepared.bind(...values) : prepared;
}

function assertSuccess<T>(result: D1ResultLike<T>, operation: string): void {
  if (!result.success) {
    throw new Error(
      `D1 ${operation} failed${result.error ? `: ${result.error}` : "."}`,
    );
  }
}

function bool(value: number): boolean {
  return value === 1;
}

function mapPolicy(row: PolicyRow | null): WateringPolicy {
  if (!row) {
    return { ...DEFAULT_POLICY };
  }

  return {
    mode: OPERATING_MODES.has(row.mode) ? row.mode : "lockout",
    dryThresholdPercent: row.dry_threshold_percent,
    targetMoisturePercent: row.target_moisture_percent,
    doseMl: row.dose_ml,
    minimumHoursBetweenRuns: row.minimum_hours_between_runs,
    dailyLimitMl: row.daily_limit_ml,
    rainSuppressionEnabled: bool(row.rain_suppression_enabled),
    calibrated: bool(row.calibrated),
  };
}

function mapWateringEvent(row: WateringRow): WateringEvent {
  return {
    id: row.id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    requestedMl: row.requested_ml,
    deliveredMl: row.delivered_ml,
    reason: row.reason,
    status: row.status,
  };
}

function mapWaterCommandResult(row: WateringRow): WaterCommandResult {
  return {
    commandId: row.command_id,
    status: row.status === "rejected" ? "rejected" : "accepted",
    reason: row.rejection_reason,
    wateringEvent: mapWateringEvent(row),
  };
}

function mapAlert(row: AlertRow): PlantAlert {
  return {
    id: row.id,
    createdAt: row.created_at,
    severity: row.severity,
    title: row.title,
    detail: row.detail,
    acknowledged: bool(row.acknowledged),
  };
}

function mapWeather(row: WeatherRow | null, now: Date): WeatherSnapshot {
  if (row) {
    return {
      observedAt: row.observed_at,
      temperatureC: row.temperature_c,
      relativeHumidityPercent: row.relative_humidity_percent,
      precipitationProbabilityPercent: row.precipitation_probability_percent,
      precipitationNext12HoursMm: row.precipitation_next_12_hours_mm,
      condition: row.condition,
      wateringSuppressed: bool(row.watering_suppressed),
    };
  }

  const observedAt = new Date(now);
  observedAt.setUTCMinutes(0, 0, 0);
  return {
    observedAt: observedAt.toISOString(),
    temperatureC: 24.1,
    relativeHumidityPercent: 49,
    precipitationProbabilityPercent: 20,
    precipitationNext12HoursMm: 0.3,
    condition: "Prototype forecast (mock)",
    wateringSuppressed: false,
  };
}

function connectionFor(receivedAt: string, now: Date): DeviceConnection {
  const ageMs = now.getTime() - Date.parse(receivedAt);
  if (Number.isFinite(ageMs) && ageMs <= 10 * 60_000) {
    return "online";
  }
  if (Number.isFinite(ageMs) && ageMs <= 60 * 60_000) {
    return "stale";
  }
  return "offline";
}

export async function getPolicy(
  db: D1DatabaseBinding,
): Promise<WateringPolicy> {
  const row = await statement(
    db,
    `SELECT zone_id, mode, dry_threshold_percent, target_moisture_percent,
            dose_ml, minimum_hours_between_runs, daily_limit_ml,
            rain_suppression_enabled, calibrated
       FROM policies
      WHERE zone_id = ?`,
    [PROTOTYPE_ZONE_ID],
  ).first<PolicyRow>();
  return mapPolicy(row);
}

async function getLatestTelemetry(
  db: D1DatabaseBinding,
): Promise<TelemetryRow | null> {
  return statement(
    db,
    `SELECT event_id, device_id, sequence, recorded_at, received_at,
            firmware_version, moisture_raw, moisture_percent,
            air_temperature_c, relative_humidity_percent, light_lux,
            tank_low, leak_detected, pump_active, sensor_status, fault_code
       FROM telemetry_events
      ORDER BY received_at DESC, rowid DESC
      LIMIT 1`,
  ).first<TelemetryRow>();
}

export async function loadDashboard(
  db: D1DatabaseBinding,
  now = new Date(),
): Promise<{ snapshot: DashboardSnapshot | null; policy: WateringPolicy }> {
  const policy = await getPolicy(db);
  const latest = await getLatestTelemetry(db);
  if (!latest) {
    return { snapshot: null, policy };
  }

  const [moistureResult, wateringResult, alertsResult, weather] = await Promise.all([
    statement(
      db,
      `SELECT recorded_at, moisture_percent
         FROM telemetry_events
        ORDER BY recorded_at DESC, rowid DESC
        LIMIT 48`,
    ).all<MoistureRow>(),
    statement(
      db,
      `SELECT id, command_id, started_at, completed_at, requested_ml,
              delivered_ml, reason, status, rejection_reason
         FROM watering_events
        ORDER BY started_at DESC
        LIMIT 20`,
    ).all<WateringRow>(),
    statement(
      db,
      `SELECT id, created_at, severity, title, detail, acknowledged
         FROM alerts
        ORDER BY created_at DESC
        LIMIT 20`,
    ).all<AlertRow>(),
    statement(
      db,
      `SELECT observed_at, temperature_c, relative_humidity_percent,
              precipitation_probability_percent,
              precipitation_next_12_hours_mm, condition, watering_suppressed
         FROM weather_snapshots
        ORDER BY observed_at DESC
        LIMIT 1`,
    ).first<WeatherRow>(),
  ]);

  assertSuccess(moistureResult, "read moisture history");
  assertSuccess(wateringResult, "read watering history");
  assertSuccess(alertsResult, "read alerts");

  const wateringEvents = wateringResult.results.map(mapWateringEvent);
  const lastCompleted = wateringEvents.find(
    (event) => event.status === "completed" && event.completedAt !== null,
  );
  const lastWateredAt = lastCompleted?.completedAt ?? null;
  const nextEligibleAt = lastWateredAt
    ? new Date(
        Date.parse(lastWateredAt) +
          policy.minimumHoursBetweenRuns * 60 * 60_000,
      ).toISOString()
    : null;

  return {
    policy,
    snapshot: {
      device: {
        id: latest.device_id,
        name: "Plant prototype",
        connection: connectionFor(latest.received_at, now),
        lastSeenAt: latest.received_at,
        firmwareVersion: latest.firmware_version,
      },
      zone: {
        id: PROTOTYPE_ZONE_ID,
        name: "Prototype pot",
        plantName: "Plant",
        moisturePercent: latest.moisture_percent,
        moistureRaw: latest.moisture_raw,
        sensorStatus: latest.sensor_status,
        airTemperatureC: latest.air_temperature_c,
        relativeHumidityPercent: latest.relative_humidity_percent,
        lightLux: latest.light_lux,
        tankLow: bool(latest.tank_low),
        leakDetected: bool(latest.leak_detected),
        pumpActive: bool(latest.pump_active),
        lastWateredAt,
        nextEligibleAt,
      },
      policy,
      weather: mapWeather(weather, now),
      readings: moistureResult.results
        .map((row) => ({
          recordedAt: row.recorded_at,
          moisturePercent: row.moisture_percent,
        }))
        .reverse(),
      wateringEvents,
      alerts: alertsResult.results.map(mapAlert),
    },
  };
}

function telemetryAlerts(telemetry: TelemetryEnvelopeV1): TelemetryAlert[] {
  const alerts: TelemetryAlert[] = [];
  if (telemetry.leakDetected) {
    alerts.push({
      id: `leak:${telemetry.eventId}`,
      severity: "critical",
      title: "Leak detected",
      detail: "Pump lockout required. Dry the tray and inspect tubing before reset.",
    });
  }
  if (telemetry.tankLow) {
    alerts.push({
      id: `tank:${telemetry.eventId}`,
      severity: "warning",
      title: "Water tank low",
      detail: "Refill the reservoir before the next watering run.",
    });
  }
  if (telemetry.sensorStatus === "fault" || telemetry.faultCode) {
    alerts.push({
      id: `sensor:${telemetry.eventId}`,
      severity: "critical",
      title: "Controller fault",
      detail: telemetry.faultCode
        ? `Controller reported fault code ${telemetry.faultCode}.`
        : "Soil sensor reported a fault. Check wiring and probe condition.",
    });
  }
  return alerts;
}

export async function storeTelemetry(
  db: D1DatabaseBinding,
  telemetry: TelemetryEnvelopeV1,
  receivedAt = new Date(),
): Promise<{ deduplicated: boolean }> {
  const statements = [
    statement(
      db,
      `INSERT OR IGNORE INTO telemetry_events (
         event_id, device_id, sequence, recorded_at, received_at,
         firmware_version, moisture_raw, moisture_percent,
         air_temperature_c, relative_humidity_percent, light_lux,
         tank_low, leak_detected, pump_active, sensor_status, fault_code
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        telemetry.eventId,
        telemetry.deviceId,
        telemetry.sequence,
        telemetry.recordedAt,
        receivedAt.toISOString(),
        telemetry.firmwareVersion,
        telemetry.moistureRaw,
        telemetry.moisturePercent,
        telemetry.airTemperatureC,
        telemetry.relativeHumidityPercent,
        telemetry.lightLux,
        telemetry.tankLow ? 1 : 0,
        telemetry.leakDetected ? 1 : 0,
        telemetry.pumpActive ? 1 : 0,
        telemetry.sensorStatus,
        telemetry.faultCode,
      ],
    ),
    ...telemetryAlerts(telemetry).map((alert) =>
      statement(
        db,
        `INSERT OR IGNORE INTO alerts (
           id, created_at, severity, title, detail, acknowledged
         ) VALUES (?, ?, ?, ?, ?, 0)`,
        [
          alert.id,
          telemetry.recordedAt,
          alert.severity,
          alert.title,
          alert.detail,
        ],
      ),
    ),
  ];
  const results = await db.batch(statements);
  results.forEach((result) => assertSuccess(result, "store telemetry"));
  return { deduplicated: (results[0]?.meta.changes ?? 0) === 0 };
}

export async function findWaterCommand(
  db: D1DatabaseBinding,
  commandId: string,
): Promise<WaterCommandResult | null> {
  const row = await statement(
    db,
    `SELECT id, command_id, started_at, completed_at, requested_ml,
            delivered_ml, reason, status, rejection_reason
       FROM watering_events
      WHERE command_id = ?
      LIMIT 1`,
    [commandId],
  ).first<WateringRow>();
  return row ? mapWaterCommandResult(row) : null;
}

export interface WaterSafetyContext {
  telemetry: TelemetryRow | null;
  policy: WateringPolicy;
  usedTodayMl: number;
  lastWateringAt: string | null;
}

export async function getWaterSafetyContext(
  db: D1DatabaseBinding,
  now = new Date(),
): Promise<WaterSafetyContext> {
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const [telemetry, policy, usage, lastWatering] = await Promise.all([
    getLatestTelemetry(db),
    getPolicy(db),
    statement(
      db,
      `SELECT COALESCE(SUM(requested_ml), 0) AS total_ml
         FROM watering_events
        WHERE started_at >= ?
          AND status IN ('queued', 'running', 'completed')`,
      [dayStart.toISOString()],
    ).first<DailyUsageRow>(),
    statement(
      db,
      `SELECT MAX(started_at) AS last_started_at
         FROM watering_events
        WHERE status IN ('queued', 'running', 'completed')`,
    ).first<LastWateringRow>(),
  ]);

  return {
    telemetry,
    policy,
    usedTodayMl: usage?.total_ml ?? 0,
    lastWateringAt: lastWatering?.last_started_at ?? null,
  };
}

export async function queueWaterCommand(
  db: D1DatabaseBinding,
  command: WaterCommandInput,
  now = new Date(),
): Promise<WaterCommandResult> {
  const id = `water:${command.commandId}`;
  const result = await statement(
    db,
    `INSERT OR IGNORE INTO watering_events (
       id, command_id, zone_id, created_at, started_at, requested_ml,
       delivered_ml, reason, status, rejection_reason
     ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'manual', 'queued', NULL)`,
    [
      id,
      command.commandId,
      command.zoneId,
      now.toISOString(),
      now.toISOString(),
      command.doseMl,
    ],
  ).run();
  assertSuccess(result, "queue water command");

  const stored = await findWaterCommand(db, command.commandId);
  if (!stored) {
    throw new Error("D1 queued water command but could not read it back.");
  }
  return stored;
}

export async function rejectWaterCommand(
  db: D1DatabaseBinding,
  commandId: string,
  reason: string,
): Promise<WaterCommandResult> {
  const result = await statement(
    db,
    `UPDATE watering_events
        SET status = 'rejected', rejection_reason = ?
      WHERE command_id = ? AND status = 'queued'`,
    [reason, commandId],
  ).run();
  assertSuccess(result, "reject water command");

  const stored = await findWaterCommand(db, commandId);
  if (!stored) {
    throw new Error("D1 rejected water command but could not read it back.");
  }
  return stored;
}

export async function updatePolicy(
  db: D1DatabaseBinding,
  update: PolicyUpdateInput,
  now = new Date(),
): Promise<WateringPolicy> {
  const result = await statement(
    db,
    `INSERT INTO policies (
       zone_id, mode, dry_threshold_percent, target_moisture_percent,
       dose_ml, minimum_hours_between_runs, daily_limit_ml,
       rain_suppression_enabled, calibrated, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT(zone_id) DO UPDATE SET
       mode = excluded.mode,
       dry_threshold_percent = excluded.dry_threshold_percent,
       target_moisture_percent = excluded.target_moisture_percent,
       dose_ml = excluded.dose_ml,
       minimum_hours_between_runs = excluded.minimum_hours_between_runs,
       daily_limit_ml = excluded.daily_limit_ml,
       rain_suppression_enabled = excluded.rain_suppression_enabled,
       updated_at = excluded.updated_at`,
    [
      PROTOTYPE_ZONE_ID,
      update.mode,
      update.dryThresholdPercent,
      update.targetMoisturePercent,
      update.doseMl,
      update.minimumHoursBetweenRuns,
      update.dailyLimitMl,
      update.rainSuppressionEnabled ? 1 : 0,
      now.toISOString(),
    ],
  ).run();
  assertSuccess(result, "update watering policy");
  return getPolicy(db);
}

export async function acknowledgeAlert(
  db: D1DatabaseBinding,
  alertId: string,
  now = new Date(),
): Promise<PlantAlert | null> {
  const result = await statement(
    db,
    `UPDATE alerts
        SET acknowledged = 1, acknowledged_at = ?
      WHERE id = ?`,
    [now.toISOString(), alertId],
  ).run();
  assertSuccess(result, "acknowledge alert");
  if ((result.meta.changes ?? 0) === 0) {
    return null;
  }

  const row = await statement(
    db,
    `SELECT id, created_at, severity, title, detail, acknowledged
       FROM alerts
      WHERE id = ?
      LIMIT 1`,
    [alertId],
  ).first<AlertRow>();
  return row ? mapAlert(row) : null;
}
