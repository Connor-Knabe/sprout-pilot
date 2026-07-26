import type { WaterCommandInput } from "@/lib/contracts";
import type { WaterSafetyContext } from "./plant-repository";
import { ApiError } from "./errors";

export function assertWateringSafe(
  command: WaterCommandInput,
  context: WaterSafetyContext,
  now = new Date(),
): void {
  const telemetry = context.telemetry;
  if (!telemetry) {
    throw new ApiError(
      503,
      "device_offline",
      "No real controller telemetry has been received; demo data cannot authorize watering.",
    );
  }

  const telemetryAge = now.getTime() - Date.parse(telemetry.received_at);
  const measurementAge = now.getTime() - Date.parse(telemetry.recorded_at);
  if (
    !Number.isFinite(telemetryAge) ||
    !Number.isFinite(measurementAge) ||
    telemetryAge > 10 * 60_000 ||
    measurementAge > 10 * 60_000
  ) {
    throw new ApiError(
      503,
      "device_offline",
      "Controller or latest measurement is older than 10 minutes. Watering was not queued.",
    );
  }
  if (context.policy.mode === "lockout") {
    throw new ApiError(
      409,
      "controller_lockout",
      "Controller policy is locked out. Clear the physical fault first.",
    );
  }
  if (context.policy.mode === "paused" || context.policy.mode === "monitor") {
    throw new ApiError(
      409,
      "watering_disabled",
      `Watering is disabled while policy mode is ${context.policy.mode}.`,
    );
  }
  if (context.policy.mode === "automatic" && !context.policy.calibrated) {
    throw new ApiError(
      409,
      "calibration_required",
      "Automatic mode requires completed soil calibration.",
    );
  }
  if (telemetry.leak_detected === 1) {
    throw new ApiError(
      409,
      "leak_detected",
      "Leak sensor is active. Watering was not queued.",
    );
  }
  if (telemetry.tank_low === 1) {
    throw new ApiError(
      409,
      "tank_low",
      "Reservoir is low. Refill it before watering.",
    );
  }
  if (telemetry.pump_active === 1) {
    throw new ApiError(
      409,
      "pump_busy",
      "Pump is already active. Wait for current run to finish.",
    );
  }
  if (telemetry.sensor_status !== "ok" || telemetry.fault_code) {
    throw new ApiError(
      409,
      "controller_fault",
      "Controller reports a sensor or hardware fault. Inspect it before watering.",
    );
  }
  if (command.doseMl > context.policy.doseMl) {
    throw new ApiError(
      409,
      "dose_limit_exceeded",
      `Command exceeds the configured ${context.policy.doseMl} mL dose limit.`,
    );
  }
  if (context.lastWateringAt) {
    const nextEligibleAt =
      Date.parse(context.lastWateringAt) +
      context.policy.minimumHoursBetweenRuns * 60 * 60_000;
    if (Number.isFinite(nextEligibleAt) && nextEligibleAt > now.getTime()) {
      throw new ApiError(
        409,
        "minimum_interval_active",
        `Next watering is eligible at ${new Date(nextEligibleAt).toISOString()}.`,
      );
    }
  }
  if (context.usedTodayMl + command.doseMl > context.policy.dailyLimitMl) {
    throw new ApiError(
      409,
      "daily_limit_exceeded",
      `Command would exceed the ${context.policy.dailyLimitMl} mL daily limit.`,
    );
  }
}
