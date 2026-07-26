CREATE TABLE `alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`severity` text NOT NULL,
	`title` text NOT NULL,
	`detail` text NOT NULL,
	`acknowledged` integer DEFAULT false NOT NULL,
	`acknowledged_at` text
);
--> statement-breakpoint
CREATE INDEX `alerts_created_at_idx` ON `alerts` (`created_at`);--> statement-breakpoint
CREATE TABLE `policies` (
	`zone_id` text PRIMARY KEY NOT NULL,
	`mode` text DEFAULT 'monitor' NOT NULL,
	`dry_threshold_percent` real DEFAULT 30 NOT NULL,
	`target_moisture_percent` real DEFAULT 45 NOT NULL,
	`dose_ml` integer DEFAULT 50 NOT NULL,
	`minimum_hours_between_runs` real DEFAULT 6 NOT NULL,
	`daily_limit_ml` integer DEFAULT 250 NOT NULL,
	`rain_suppression_enabled` integer DEFAULT true NOT NULL,
	`calibrated` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `telemetry_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`recorded_at` text NOT NULL,
	`received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`firmware_version` text NOT NULL,
	`moisture_raw` integer NOT NULL,
	`moisture_percent` real NOT NULL,
	`air_temperature_c` real,
	`relative_humidity_percent` real,
	`light_lux` real,
	`tank_low` integer NOT NULL,
	`leak_detected` integer NOT NULL,
	`pump_active` integer NOT NULL,
	`sensor_status` text NOT NULL,
	`fault_code` text
);
--> statement-breakpoint
CREATE INDEX `telemetry_recorded_at_idx` ON `telemetry_events` (`recorded_at`);--> statement-breakpoint
CREATE INDEX `telemetry_device_sequence_idx` ON `telemetry_events` (`device_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `watering_events` (
	`id` text PRIMARY KEY NOT NULL,
	`command_id` text NOT NULL,
	`zone_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`requested_ml` integer NOT NULL,
	`delivered_ml` real,
	`reason` text NOT NULL,
	`status` text NOT NULL,
	`rejection_reason` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `watering_command_id_idx` ON `watering_events` (`command_id`);--> statement-breakpoint
CREATE INDEX `watering_started_at_idx` ON `watering_events` (`started_at`);--> statement-breakpoint
CREATE TABLE `weather_snapshots` (
	`observed_at` text PRIMARY KEY NOT NULL,
	`temperature_c` real NOT NULL,
	`relative_humidity_percent` real NOT NULL,
	`precipitation_probability_percent` real NOT NULL,
	`precipitation_next_12_hours_mm` real NOT NULL,
	`condition` text NOT NULL,
	`watering_suppressed` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `weather_observed_at_idx` ON `weather_snapshots` (`observed_at`);