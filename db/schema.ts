import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const telemetryEvents = sqliteTable(
  "telemetry_events",
  {
    eventId: text("event_id").primaryKey(),
    deviceId: text("device_id").notNull(),
    sequence: integer("sequence").notNull(),
    recordedAt: text("recorded_at").notNull(),
    receivedAt: text("received_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    firmwareVersion: text("firmware_version").notNull(),
    moistureRaw: integer("moisture_raw").notNull(),
    moisturePercent: real("moisture_percent").notNull(),
    airTemperatureC: real("air_temperature_c"),
    relativeHumidityPercent: real("relative_humidity_percent"),
    lightLux: real("light_lux"),
    tankLow: integer("tank_low", { mode: "boolean" }).notNull(),
    leakDetected: integer("leak_detected", { mode: "boolean" }).notNull(),
    pumpActive: integer("pump_active", { mode: "boolean" }).notNull(),
    sensorStatus: text("sensor_status", {
      enum: ["ok", "stale", "fault"],
    }).notNull(),
    faultCode: text("fault_code"),
  },
  (table) => [
    index("telemetry_recorded_at_idx").on(table.recordedAt),
    index("telemetry_device_sequence_idx").on(
      table.deviceId,
      table.sequence,
    ),
  ],
);

export const policies = sqliteTable("policies", {
  zoneId: text("zone_id").primaryKey(),
  mode: text("mode", {
    enum: ["monitor", "manual", "automatic", "paused", "lockout"],
  })
    .notNull()
    .default("monitor"),
  dryThresholdPercent: real("dry_threshold_percent").notNull().default(30),
  targetMoisturePercent: real("target_moisture_percent")
    .notNull()
    .default(45),
  doseMl: integer("dose_ml").notNull().default(50),
  minimumHoursBetweenRuns: real("minimum_hours_between_runs")
    .notNull()
    .default(6),
  dailyLimitMl: integer("daily_limit_ml").notNull().default(250),
  rainSuppressionEnabled: integer("rain_suppression_enabled", {
    mode: "boolean",
  })
    .notNull()
    .default(true),
  calibrated: integer("calibrated", { mode: "boolean" })
    .notNull()
    .default(false),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const wateringEvents = sqliteTable(
  "watering_events",
  {
    id: text("id").primaryKey(),
    commandId: text("command_id").notNull(),
    zoneId: text("zone_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    requestedMl: integer("requested_ml").notNull(),
    deliveredMl: real("delivered_ml"),
    reason: text("reason", { enum: ["manual", "moisture"] }).notNull(),
    status: text("status", {
      enum: ["queued", "running", "completed", "rejected", "interrupted"],
    }).notNull(),
    rejectionReason: text("rejection_reason"),
  },
  (table) => [
    uniqueIndex("watering_command_id_idx").on(table.commandId),
    index("watering_started_at_idx").on(table.startedAt),
  ],
);

export const alerts = sqliteTable(
  "alerts",
  {
    id: text("id").primaryKey(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    severity: text("severity", {
      enum: ["info", "warning", "critical"],
    }).notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    acknowledged: integer("acknowledged", { mode: "boolean" })
      .notNull()
      .default(false),
    acknowledgedAt: text("acknowledged_at"),
  },
  (table) => [index("alerts_created_at_idx").on(table.createdAt)],
);

export const weatherSnapshots = sqliteTable(
  "weather_snapshots",
  {
    observedAt: text("observed_at").primaryKey(),
    temperatureC: real("temperature_c").notNull(),
    relativeHumidityPercent: real("relative_humidity_percent").notNull(),
    precipitationProbabilityPercent: real(
      "precipitation_probability_percent",
    ).notNull(),
    precipitationNext12HoursMm: real(
      "precipitation_next_12_hours_mm",
    ).notNull(),
    condition: text("condition").notNull(),
    wateringSuppressed: integer("watering_suppressed", { mode: "boolean" })
      .notNull(),
  },
  (table) => [index("weather_observed_at_idx").on(table.observedAt)],
);
