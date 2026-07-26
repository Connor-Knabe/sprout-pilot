"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import type {
  DashboardSnapshot,
  DemoScenario,
  MoisturePoint,
  OperatingMode,
  PolicyUpdateInput,
  WaterCommandInput,
  WaterCommandResult,
  WateringPolicy,
} from "@/lib/contracts";

type Notice = {
  tone: "success" | "error";
  message: string;
};

const MODE_LABELS: Record<OperatingMode, string> = {
  monitor: "Monitor only",
  manual: "Manual watering",
  automatic: "Automatic",
  paused: "Paused",
  lockout: "Safety lockout",
};

const DEMO_SCENARIO_LABELS: Record<DemoScenario, string> = {
  healthy: "Healthy plant",
  dry: "Dry soil",
  watering: "Watering now",
  rainy: "Rain forecast",
  "tank-low": "Low reservoir",
  leak: "Leak detected",
  "sensor-fault": "Probe fault",
  offline: "Controller offline",
};

const FALLBACK_MOISTURE = [
  51, 50, 49, 49, 47, 46, 45, 43, 42, 40, 39, 38, 37,
] as const;

function createFallbackSnapshot(): DashboardSnapshot {
  const now = Date.now();
  const at = (offsetMinutes: number) =>
    new Date(now + offsetMinutes * 60_000).toISOString();

  return {
    device: {
      id: "demo-photon-2",
      name: "Kitchen prototype",
      connection: "offline",
      lastSeenAt: at(-18),
      firmwareVersion: "demo-fallback",
    },
    zone: {
      id: "zone-1",
      name: "Zone 1",
      plantName: "Demo basil",
      moisturePercent: 37,
      moistureRaw: 2_146,
      sensorStatus: "stale",
      airTemperatureC: 22.4,
      relativeHumidityPercent: 48,
      lightLux: 8_420,
      tankLow: false,
      leakDetected: false,
      pumpActive: false,
      lastWateredAt: at(-1_560),
      nextEligibleAt: at(-1_200),
    },
    policy: {
      mode: "manual",
      dryThresholdPercent: 30,
      targetMoisturePercent: 45,
      doseMl: 50,
      minimumHoursBetweenRuns: 6,
      dailyLimitMl: 250,
      rainSuppressionEnabled: true,
      calibrated: false,
    },
    weather: {
      observedAt: at(-34),
      temperatureC: 23.1,
      relativeHumidityPercent: 46,
      precipitationProbabilityPercent: 20,
      precipitationNext12HoursMm: 0.4,
      condition: "Partly cloudy (fallback mock)",
      wateringSuppressed: false,
    },
    readings: FALLBACK_MOISTURE.map((moisturePercent, index) => ({
      recordedAt: at(-1_440 + index * 120),
      moisturePercent,
    })),
    wateringEvents: [
      {
        id: "demo-water-1",
        startedAt: at(-1_560),
        completedAt: at(-1_558),
        requestedMl: 50,
        deliveredMl: null,
        reason: "manual",
        status: "completed",
      },
      {
        id: "demo-water-2",
        startedAt: at(-4_680),
        completedAt: at(-4_678),
        requestedMl: 50,
        deliveredMl: null,
        reason: "manual",
        status: "completed",
      },
    ],
    alerts: [
      {
        id: "demo-calibration",
        createdAt: at(-9_600),
        severity: "info",
        title: "Soil probe needs calibration",
        detail:
          "Capture dry and fully watered readings before enabling automatic mode.",
        acknowledged: false,
      },
    ],
  };
}

async function getResponseError(response: Response): Promise<string> {
  const fallback = `Request failed (${response.status})`;

  try {
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return fallback;

    const error = "error" in body ? body.error : null;
    if (typeof error === "string" && error.trim()) return error;
    if (typeof error === "object" && error !== null && "message" in error) {
      const nestedMessage = error.message;
      if (typeof nestedMessage === "string" && nestedMessage.trim())
        return nestedMessage;
    }

    const message = "message" in body ? body.message : null;
    if (typeof message === "string" && message.trim()) return message;
  } catch {
    // Non-JSON error responses use the status-based fallback above.
  }

  return fallback;
}

function isDemoSnapshot(snapshot: DashboardSnapshot): boolean {
  return (
    snapshot.device.id.startsWith("demo-") ||
    snapshot.device.firmwareVersion.startsWith("demo-")
  );
}

async function fetchDashboard({
  signal,
  demoScenario,
}: {
  signal?: AbortSignal;
  demoScenario?: DemoScenario;
} = {}): Promise<DashboardSnapshot> {
  const path = demoScenario
    ? `/api/dashboard?demo=${encodeURIComponent(demoScenario)}`
    : "/api/dashboard";
  const response = await fetch(path, {
    cache: "no-store",
    signal,
  });

  if (!response.ok) throw new Error(await getResponseError(response));
  return (await response.json()) as DashboardSnapshot;
}

function formatRelativeTime(value: string | null): string {
  if (!value) return "Not yet";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Unknown";

  const minutes = Math.round((timestamp - Date.now()) / 60_000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");

  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function celsiusToFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

function formatLux(lux: number | null): string {
  if (lux === null) return "—";
  if (lux >= 1_000) return `${(lux / 1_000).toFixed(1)}k`;
  return new Intl.NumberFormat("en").format(Math.round(lux));
}

function getMoistureState(snapshot: DashboardSnapshot): {
  label: string;
  detail: string;
  tone: "good" | "watch" | "danger";
} {
  const { zone, policy } = snapshot;

  if (zone.leakDetected)
    return {
      label: "Leak detected",
      detail: "Pump power is locked. Inspect tray and tubing.",
      tone: "danger",
    };
  if (zone.tankLow)
    return {
      label: "Tank needs water",
      detail: "Refill reservoir before the next watering.",
      tone: "danger",
    };
  if (zone.sensorStatus === "fault")
    return {
      label: "Probe fault",
      detail: "Check the soil probe connection before watering.",
      tone: "danger",
    };
  if (zone.pumpActive)
    return {
      label: "Watering now",
      detail: `${policy.doseMl} mL dose is in progress.`,
      tone: "good",
    };
  if (zone.moisturePercent <= policy.dryThresholdPercent)
    return {
      label: "Soil is dry",
      detail: `Below your ${policy.dryThresholdPercent}% dry threshold.`,
      tone: "watch",
    };
  if (zone.moisturePercent >= policy.targetMoisturePercent)
    return {
      label: "Moisture on target",
      detail: `At or above your ${policy.targetMoisturePercent}% target.`,
      tone: "good",
    };
  return {
    label: "Moisture is steady",
    detail: `${policy.targetMoisturePercent - zone.moisturePercent}% below target, not yet dry.`,
    tone: "good",
  };
}

function getWaterBlockReason(snapshot: DashboardSnapshot): string | null {
  const { device, zone, policy } = snapshot;

  if (device.connection !== "online") return "Device must be online to water.";
  if (policy.mode === "lockout") return "Safety lockout must be cleared first.";
  if (policy.mode === "paused") return "Watering is paused in policy settings.";
  if (policy.mode === "monitor")
    return "Switch policy to Manual watering before sending a dose.";
  if (zone.leakDetected) return "Leak sensor is active. Inspect hardware first.";
  if (zone.tankLow) return "Reservoir is low. Refill it before watering.";
  if (zone.sensorStatus === "fault") return "Soil probe fault must be fixed first.";
  if (zone.pumpActive) return "A watering dose is already running.";
  if (
    zone.nextEligibleAt &&
    new Date(zone.nextEligibleAt).getTime() > Date.now()
  )
    return `Next dose is eligible ${formatRelativeTime(zone.nextEligibleAt)}.`;

  return null;
}

function SproutMark() {
  return (
    <span className="sprout-mark" aria-hidden="true">
      <span className="sprout-mark__stem" />
      <span className="sprout-mark__leaf sprout-mark__leaf--left" />
      <span className="sprout-mark__leaf sprout-mark__leaf--right" />
    </span>
  );
}

function MoistureChart({
  readings,
  threshold,
}: {
  readings: MoisturePoint[];
  threshold: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sortedReadings = useMemo(
    () =>
      [...readings].sort(
        (a, b) =>
          new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
      ),
    [readings],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || sortedReadings.length === 0) return;

    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width === 0 || height === 0) return;

      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * pixelRatio);
      canvas.height = Math.floor(height * pixelRatio);

      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);

      const plot = { left: 38, top: 18, right: width - 14, bottom: height - 28 };
      const plotWidth = Math.max(plot.right - plot.left, 1);
      const plotHeight = Math.max(plot.bottom - plot.top, 1);
      const xFor = (index: number) =>
        plot.left +
        (sortedReadings.length === 1
          ? plotWidth / 2
          : (index / (sortedReadings.length - 1)) * plotWidth);
      const yFor = (value: number) =>
        plot.bottom - (Math.min(100, Math.max(0, value)) / 100) * plotHeight;

      context.font = "500 11px ui-sans-serif, system-ui, sans-serif";
      context.textAlign = "right";
      context.textBaseline = "middle";
      [25, 50, 75].forEach((mark) => {
        const y = yFor(mark);
        context.beginPath();
        context.strokeStyle = "#dde5df";
        context.lineWidth = 1;
        context.moveTo(plot.left, y);
        context.lineTo(plot.right, y);
        context.stroke();
        context.fillStyle = "#718078";
        context.fillText(`${mark}%`, plot.left - 8, y);
      });

      const thresholdY = yFor(threshold);
      context.save();
      context.setLineDash([5, 5]);
      context.strokeStyle = "#cf7b47";
      context.lineWidth = 1.25;
      context.beginPath();
      context.moveTo(plot.left, thresholdY);
      context.lineTo(plot.right, thresholdY);
      context.stroke();
      context.restore();

      const area = context.createLinearGradient(0, plot.top, 0, plot.bottom);
      area.addColorStop(0, "rgba(43, 126, 94, 0.30)");
      area.addColorStop(1, "rgba(43, 126, 94, 0.025)");
      context.beginPath();
      context.moveTo(xFor(0), plot.bottom);
      sortedReadings.forEach((point, index) => {
        context.lineTo(xFor(index), yFor(point.moisturePercent));
      });
      context.lineTo(xFor(sortedReadings.length - 1), plot.bottom);
      context.closePath();
      context.fillStyle = area;
      context.fill();

      context.beginPath();
      sortedReadings.forEach((point, index) => {
        const x = xFor(index);
        const y = yFor(point.moisturePercent);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.strokeStyle = "#237453";
      context.lineWidth = 2.5;
      context.lineJoin = "round";
      context.lineCap = "round";
      context.stroke();

      const lastIndex = sortedReadings.length - 1;
      context.beginPath();
      context.arc(
        xFor(lastIndex),
        yFor(sortedReadings[lastIndex].moisturePercent),
        4,
        0,
        Math.PI * 2,
      );
      context.fillStyle = "#ffffff";
      context.fill();
      context.lineWidth = 2.5;
      context.strokeStyle = "#237453";
      context.stroke();

      const firstTime = new Date(sortedReadings[0].recordedAt);
      const lastTime = new Date(sortedReadings[lastIndex].recordedAt);
      const timeFormatter = new Intl.DateTimeFormat("en", {
        hour: "numeric",
        minute: "2-digit",
      });
      context.textBaseline = "bottom";
      context.fillStyle = "#718078";
      context.textAlign = "left";
      context.fillText(timeFormatter.format(firstTime), plot.left, height - 4);
      context.textAlign = "right";
      context.fillText(timeFormatter.format(lastTime), plot.right, height - 4);
    };

    draw();
    const resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(canvas);
    return () => resizeObserver.disconnect();
  }, [sortedReadings, threshold]);

  if (sortedReadings.length === 0) {
    return <div className="chart-empty">No moisture readings yet.</div>;
  }

  const values = sortedReadings.map((reading) => reading.moisturePercent);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const latest = values.at(-1) ?? 0;

  return (
    <>
      {/* A canvas chart has no equivalent static img source. */}
      <canvas
        ref={canvasRef}
        className="moisture-chart"
        role="img"
        aria-label={`Moisture history from ${low}% to ${high}%, latest ${latest}%. Dry threshold ${threshold}%.`}
      />
      <div className="chart-legend" aria-hidden="true">
        <span>
          <i className="legend-line legend-line--moisture" /> Moisture
        </span>
        <span>
          <i className="legend-line legend-line--threshold" /> Dry threshold
        </span>
        <span className="chart-range">
          Low {low}% · High {high}%
        </span>
      </div>
    </>
  );
}

function MetricCard({
  eyebrow,
  value,
  unit,
  detail,
  tone = "default",
}: {
  eyebrow: string;
  value: string;
  unit?: string;
  detail: string;
  tone?: "default" | "good" | "warning";
}) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <div className="metric-card__topline">
        <span className="metric-card__eyebrow">{eyebrow}</span>
        <span className="metric-card__dot" aria-hidden="true" />
      </div>
      <p className="metric-card__value">
        {value}
        {unit && <span>{unit}</span>}
      </p>
      <p className="metric-card__detail">{detail}</p>
    </article>
  );
}

function PolicyEditor({
  policy,
  saving,
  readOnly,
  onSave,
}: {
  policy: WateringPolicy;
  saving: boolean;
  readOnly: boolean;
  onSave: (input: PolicyUpdateInput) => Promise<WateringPolicy>;
}) {
  const initial = useMemo<PolicyUpdateInput>(
    () => ({
      mode: policy.mode,
      dryThresholdPercent: policy.dryThresholdPercent,
      targetMoisturePercent: policy.targetMoisturePercent,
      doseMl: policy.doseMl,
      minimumHoursBetweenRuns: policy.minimumHoursBetweenRuns,
      dailyLimitMl: policy.dailyLimitMl,
      rainSuppressionEnabled: policy.rainSuppressionEnabled,
    }),
    [policy],
  );
  const [draft, setDraft] = useState(initial);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const updateNumber = (
    key: keyof Pick<
      PolicyUpdateInput,
      | "dryThresholdPercent"
      | "targetMoisturePercent"
      | "doseMl"
      | "minimumHoursBetweenRuns"
      | "dailyLimitMl"
    >,
    value: string,
  ) => {
    const parsed = Number(value);
    if (Number.isFinite(parsed))
      setDraft((current) => ({ ...current, [key]: parsed }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (readOnly) return;
    if (draft.targetMoisturePercent < draft.dryThresholdPercent + 5) {
      setFieldError(
        "Target moisture must be at least 5 points above the dry threshold.",
      );
      return;
    }
    setFieldError(null);
    try {
      const saved = await onSave(draft);
      setDraft({
        mode: saved.mode,
        dryThresholdPercent: saved.dryThresholdPercent,
        targetMoisturePercent: saved.targetMoisturePercent,
        doseMl: saved.doseMl,
        minimumHoursBetweenRuns: saved.minimumHoursBetweenRuns,
        dailyLimitMl: saved.dailyLimitMl,
        rainSuppressionEnabled: saved.rainSuppressionEnabled,
      });
    } catch (error: unknown) {
      setFieldError(
        error instanceof Error ? error.message : "Could not save policy.",
      );
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <fieldset className="policy-form" disabled={readOnly}>
      <div className="policy-grid">
        <label className="field field--wide">
          <span>Operating mode</span>
          <select
            value={draft.mode}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                mode: event.target.value as OperatingMode,
              }))
            }
          >
            <option value="monitor">Monitor only</option>
            <option value="manual">Manual watering</option>
            <option value="automatic" disabled={!policy.calibrated}>
              Automatic{!policy.calibrated ? " — calibrate first" : ""}
            </option>
            <option value="paused">Paused</option>
          </select>
        </label>

        <label className="field">
          <span>Dry below</span>
          <span className="number-input">
            <input
              type="number"
              min="5"
              max="70"
              step="1"
              value={draft.dryThresholdPercent}
              onChange={(event) =>
                updateNumber("dryThresholdPercent", event.target.value)
              }
            />
            <i>%</i>
          </span>
        </label>

        <label className="field">
          <span>Moisture target</span>
          <span className="number-input">
            <input
              type="number"
              min="10"
              max="90"
              step="1"
              value={draft.targetMoisturePercent}
              onChange={(event) =>
                updateNumber("targetMoisturePercent", event.target.value)
              }
            />
            <i>%</i>
          </span>
        </label>

        <label className="field">
          <span>Dose size</span>
          <span className="number-input">
            <input
              type="number"
              min="10"
              max="100"
              step="10"
              value={draft.doseMl}
              onChange={(event) => updateNumber("doseMl", event.target.value)}
            />
            <i>mL</i>
          </span>
        </label>

        <label className="field">
          <span>Minimum interval</span>
          <span className="number-input">
            <input
              type="number"
              min="1"
              max="72"
              step="1"
              value={draft.minimumHoursBetweenRuns}
              onChange={(event) =>
                updateNumber("minimumHoursBetweenRuns", event.target.value)
              }
            />
            <i>hr</i>
          </span>
        </label>

        <label className="field field--wide">
          <span>Daily safety limit</span>
          <span className="number-input">
            <input
              type="number"
              min={draft.doseMl}
              max="2000"
              step="10"
              value={draft.dailyLimitMl}
              onChange={(event) =>
                updateNumber("dailyLimitMl", event.target.value)
              }
            />
            <i>mL</i>
          </span>
        </label>
      </div>

      <label className="switch-row" aria-label="Rain suppression">
        <span>
          <strong>Rain suppression</strong>
          <small>Skip automatic watering when rain is expected.</small>
        </span>
        <input
          type="checkbox"
          checked={draft.rainSuppressionEnabled}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              rainSuppressionEnabled: event.target.checked,
            }))
          }
        />
        <span className="switch" aria-hidden="true" />
      </label>

      {!policy.calibrated && (
        <p className="calibration-note">
          Automatic mode stays disabled until the soil probe is calibrated.
        </p>
      )}
      {readOnly && (
        <p className="demo-readonly-note">
          Example mode is read-only. Policy changes are never sent or saved.
        </p>
      )}
      {fieldError && <p className="field-error">{fieldError}</p>}

      <div className="form-actions">
        <span>
          {readOnly
            ? "Read-only example"
            : dirty
              ? "Unsaved changes"
              : "Policy is up to date"}
        </span>
        <button className="button button--secondary" disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save policy"}
        </button>
      </div>
      </fieldset>
    </form>
  );
}

function ConfirmWaterDialog({
  doseMl,
  busy,
  onCancel,
  onConfirm,
}: {
  doseMl: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!previousFocusRef.current && document.activeElement instanceof HTMLElement)
      previousFocusRef.current = document.activeElement;
    cancelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        ) ?? [],
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onCancel]);

  useEffect(
    () => () => {
      previousFocusRef.current?.focus();
    },
    [],
  );

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !busy) onCancel();
      }}
    >
      <section
        ref={dialogRef}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-description"
      >
        <span className="confirm-dialog__mark" aria-hidden="true">
          {doseMl}
          <small>mL</small>
        </span>
        <div>
          <p className="section-kicker">Manual dose</p>
          <h2 id="confirm-title">Water this plant now?</h2>
          <p id="confirm-description">
            Pump will dispense one {doseMl} mL dose. Keep reservoir and tubing in
            view during prototype testing.
          </p>
        </div>
        <div className="dialog-actions">
          <button
            ref={cancelRef}
            className="button button--ghost"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="button button--primary"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Sending…" : `Dispense ${doseMl} mL`}
          </button>
        </div>
      </section>
    </div>
  );
}

function DashboardLoading() {
  return (
    <main className="dashboard-shell dashboard-shell--loading" aria-busy="true">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Sprout Pilot home">
          <SproutMark />
          <span>
            <strong>Sprout</strong> Pilot
          </span>
        </a>
        <span className="prototype-badge">Prototype · Zone 1</span>
      </header>
      {/* This live region contains structured loading copy, not a form result. */}
      <section className="loading-panel" role="status" aria-live="polite">
        <span className="loading-leaf" aria-hidden="true" />
        <p className="section-kicker">Connecting to controller</p>
        <h1>Reading your plant…</h1>
        <p>Loading soil moisture, weather, and pump safety state.</p>
      </section>
    </main>
  );
}

export function SproutDashboard({ demoMode = false }: { demoMode?: boolean }) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [source, setSource] = useState<"live" | "demo">(
    demoMode ? "demo" : "live",
  );
  const [demoScenario, setDemoScenario] = useState<DemoScenario | null>(
    demoMode ? "healthy" : null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmingWater, setConfirmingWater] = useState(false);
  const [sendingWater, setSendingWater] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchDashboard({
      signal: controller.signal,
      demoScenario: demoScenario ?? undefined,
    })
      .then((nextSnapshot) => {
        setSnapshot(nextSnapshot);
        setSource(
          demoScenario || isDemoSnapshot(nextSnapshot) ? "demo" : "live",
        );
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setSnapshot(createFallbackSnapshot());
        setSource("demo");
        setLoadError(
          error instanceof Error ? error.message : "Dashboard API unavailable.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setRefreshing(false);
      });
    return () => controller.abort();
  }, [demoScenario]);

  const refreshDashboard = useCallback(async () => {
    setRefreshing(true);
    try {
      const nextSnapshot = await fetchDashboard({
        demoScenario: demoScenario ?? undefined,
      });
      setSnapshot(nextSnapshot);
      setSource(
        demoScenario || isDemoSnapshot(nextSnapshot) ? "demo" : "live",
      );
      setLoadError(null);
    } catch (error: unknown) {
      setLoadError(
        error instanceof Error ? error.message : "Dashboard API unavailable.",
      );
    } finally {
      setRefreshing(false);
    }
  }, [demoScenario]);

  if (!snapshot) return <DashboardLoading />;

  const moistureState = getMoistureState(snapshot);
  const waterBlockReason = getWaterBlockReason(snapshot);
  const moistureAngle = Math.min(
    360,
    Math.max(0, snapshot.zone.moisturePercent * 3.6),
  );
  const unacknowledgedAlerts = snapshot.alerts.filter(
    (alert) => !alert.acknowledged,
  );
  const displayedWaterBlockReason =
    source === "demo"
      ? "Example mode is read-only. No command can reach a pump."
      : waterBlockReason;

  const sendWaterCommand = async () => {
    setSendingWater(true);
    setNotice(null);
    const input: WaterCommandInput = {
      commandId: globalThis.crypto.randomUUID(),
      zoneId: snapshot.zone.id,
      doseMl: snapshot.policy.doseMl,
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    };

    try {
      const response = await fetch("/api/water", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error(await getResponseError(response));

      const result = (await response.json()) as WaterCommandResult;
      if (result.status === "rejected")
        throw new Error(result.reason ?? "Controller rejected the watering dose.");

      if (result.wateringEvent) {
        setSnapshot((current) =>
          current
            ? {
                ...current,
                wateringEvents: [
                  result.wateringEvent as NonNullable<
                    WaterCommandResult["wateringEvent"]
                  >,
                  ...current.wateringEvents.filter(
                    (event) => event.id !== result.wateringEvent?.id,
                  ),
                ],
              }
            : current,
        );
      }
      setConfirmingWater(false);
      setNotice({
        tone: "success",
        message: `${snapshot.policy.doseMl} mL dose accepted by controller.`,
      });
      await refreshDashboard();
    } catch (error: unknown) {
      setNotice({
        tone: "error",
        message:
          error instanceof Error ? error.message : "Watering command failed.",
      });
    } finally {
      setSendingWater(false);
    }
  };

  const savePolicy = async (
    input: PolicyUpdateInput,
  ): Promise<WateringPolicy> => {
    setSavingPolicy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/policy", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error(await getResponseError(response));

      const saved = (await response.json()) as WateringPolicy;
      setSnapshot((current) =>
        current ? { ...current, policy: saved } : current,
      );
      setNotice({ tone: "success", message: "Watering policy saved." });
      return saved;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Could not save policy.";
      setNotice({ tone: "error", message });
      throw error;
    } finally {
      setSavingPolicy(false);
    }
  };

  return (
    <main className="dashboard-shell" id="top">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Sprout Pilot home">
          <SproutMark />
          <span>
            <strong>Sprout</strong> Pilot
          </span>
        </a>
        <div className="topbar__status">
          <span className="prototype-badge">Prototype · Zone 1</span>
          <span
            className={`connection connection--${snapshot.device.connection}`}
          >
            <i aria-hidden="true" />
            {source === "demo"
              ? `Mock · ${snapshot.device.connection}`
              : snapshot.device.connection === "online"
                ? "Controller online"
                : snapshot.device.connection === "stale"
                  ? "Controller stale"
                  : "Controller offline"}
          </span>
        </div>
      </header>

      {source === "demo" && (
        <section className="demo-toolbar" aria-label="Example data controls">
          <div className="demo-toolbar__copy">
            <strong>{demoMode ? "Interactive example" : "Demo data"}</strong>
            <span>
              Mock readings only. Watering and policy writes stay disabled.
            </span>
          </div>
          {demoMode && demoScenario ? (
            <label className="demo-toolbar__scenario">
              <span>Plant scenario</span>
              <select
                value={demoScenario}
                onChange={(event) => {
                  setRefreshing(true);
                  setDemoScenario(event.target.value as DemoScenario);
                }}
                disabled={refreshing}
              >
                {Object.entries(DEMO_SCENARIO_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <Link className="demo-toolbar__link" href="/demo">
              Explore safety scenarios
            </Link>
          )}
        </section>
      )}

      {(loadError || notice) && (
        <div
          className={`notice notice--${notice?.tone ?? "warning"}`}
          role={notice?.tone === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          <div>
            <strong>
              {notice
                ? notice.tone === "success"
                  ? "Done"
                  : "Action failed"
                : source === "demo"
                  ? "Live data unavailable"
                  : "Connection issue"}
            </strong>
            <span>
              {notice?.message ??
                `${loadError} Showing clearly labeled demo data until connection returns.`}
            </span>
          </div>
          {loadError && (
            <button
              className="notice__action"
              onClick={refreshDashboard}
              disabled={refreshing}
            >
              {refreshing ? "Retrying…" : "Retry live data"}
            </button>
          )}
          {notice && (
            <button
              className="notice__dismiss"
              aria-label="Dismiss message"
              onClick={() => setNotice(null)}
            >
              ×
            </button>
          )}
        </div>
      )}

      <div className="dashboard-heading">
        <div>
          <p className="section-kicker">{snapshot.device.name}</p>
          <h1>{snapshot.zone.plantName}</h1>
        </div>
        <div className="updated-at">
          <span>Last reading</span>
          <strong>{formatRelativeTime(snapshot.device.lastSeenAt)}</strong>
          {source === "demo" && <i>Demo snapshot</i>}
        </div>
      </div>

      <section className="hero-grid" aria-label="Current plant status">
        <article className={`moisture-hero moisture-hero--${moistureState.tone}`}>
          <div className="moisture-hero__copy">
            <p className="section-kicker">Soil moisture</p>
            <h2>{moistureState.label}</h2>
            <p>{moistureState.detail}</p>
            <div className="moisture-meta">
              <span>
                Dry below <strong>{snapshot.policy.dryThresholdPercent}%</strong>
              </span>
              <span>
                Target <strong>{snapshot.policy.targetMoisturePercent}%</strong>
              </span>
              <span>
                Probe <strong>{snapshot.zone.sensorStatus}</strong>
              </span>
            </div>
          </div>
          {/* This CSS-rendered gauge is exposed as one descriptive image. */}
          <div
            className="moisture-gauge"
            style={{ "--moisture-angle": `${moistureAngle}deg` } as CSSProperties}
            aria-label={`${snapshot.zone.moisturePercent}% soil moisture`}
            role="img"
          >
            <div>
              <strong>{snapshot.zone.moisturePercent}</strong>
              <span>%</span>
              <small>moisture</small>
            </div>
          </div>
        </article>

        <aside className="water-card">
          <div>
            <p className="section-kicker">Manual control</p>
            <h2>One bounded dose</h2>
            <p>
              Controller will request <strong>{snapshot.policy.doseMl} mL</strong>,
              then stop at its local runtime limit.
            </p>
          </div>
          <button
            className="water-button"
            aria-label={`Water now: one ${snapshot.policy.doseMl} milliliter dose`}
            onClick={() => setConfirmingWater(true)}
            disabled={Boolean(displayedWaterBlockReason) || sendingWater}
            aria-describedby={
              displayedWaterBlockReason ? "water-block-reason" : undefined
            }
          >
            <span className="water-button__drop" aria-hidden="true" />
            <span>
              <strong>{snapshot.zone.pumpActive ? "Watering…" : "Water now"}</strong>
              <small>{snapshot.policy.doseMl} mL dose</small>
            </span>
          </button>
          <p
            className={`water-eligibility ${displayedWaterBlockReason ? "water-eligibility--blocked" : ""}`}
            id={displayedWaterBlockReason ? "water-block-reason" : undefined}
          >
            <span aria-hidden="true">
              {displayedWaterBlockReason ? "!" : "✓"}
            </span>
            {displayedWaterBlockReason ??
              "Safety checks passed. Ready to send."}
          </p>
          <div className="water-card__foot">
            <span>Last watered</span>
            <strong>{formatRelativeTime(snapshot.zone.lastWateredAt)}</strong>
          </div>
        </aside>
      </section>

      <section className="metrics-grid" aria-label="Environment readings">
        <MetricCard
          eyebrow="Air temperature"
          value={
            snapshot.zone.airTemperatureC === null
              ? "—"
              : Math.round(
                  celsiusToFahrenheit(snapshot.zone.airTemperatureC),
                ).toString()
          }
          unit={snapshot.zone.airTemperatureC === null ? undefined : "°F"}
          detail={
            snapshot.zone.airTemperatureC === null
              ? "Sensor unavailable"
              : `${snapshot.zone.airTemperatureC.toFixed(1)}°C · ${snapshot.zone.relativeHumidityPercent ?? "—"}% humidity`
          }
        />
        <MetricCard
          eyebrow="Light"
          value={formatLux(snapshot.zone.lightLux)}
          unit={snapshot.zone.lightLux === null ? undefined : "lux"}
          detail={
            snapshot.zone.lightLux !== null && snapshot.zone.lightLux >= 5_000
              ? "Bright enough for a sunny window"
              : "Low to moderate light"
          }
        />
        <MetricCard
          eyebrow="Reservoir"
          value={snapshot.zone.tankLow ? "Low" : "Ready"}
          detail={
            snapshot.zone.tankLow
              ? "Refill before running the pump"
              : "Float switch reports enough water"
          }
          tone={snapshot.zone.tankLow ? "warning" : "good"}
        />
        <MetricCard
          eyebrow="Local forecast"
          value={`${snapshot.weather.precipitationProbabilityPercent}`}
          unit="% rain"
          detail={`${snapshot.weather.condition} · ${snapshot.weather.precipitationNext12HoursMm.toFixed(1)} mm next 12 hr`}
          tone={snapshot.weather.wateringSuppressed ? "warning" : "default"}
        />
      </section>

      <div className="content-grid">
        <section className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Last 24 hours</p>
              <h2>Moisture history</h2>
            </div>
            <span className="panel-value">
              {snapshot.zone.moisturePercent}% <small>now</small>
            </span>
          </div>
          <MoistureChart
            readings={snapshot.readings}
            threshold={snapshot.policy.dryThresholdPercent}
          />
        </section>

        <section className="panel alerts-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">System health</p>
              <h2>Alerts</h2>
            </div>
            <span className="count-badge">{unacknowledgedAlerts.length}</span>
          </div>
          {unacknowledgedAlerts.length === 0 ? (
            <div className="empty-state">
              <span aria-hidden="true">✓</span>
              <div>
                <strong>Everything looks good</strong>
                <p>No open alerts for this zone.</p>
              </div>
            </div>
          ) : (
            <ul className="alert-list">
              {unacknowledgedAlerts.slice(0, 4).map((alert) => (
                <li key={alert.id} className={`alert alert--${alert.severity}`}>
                  <span className="alert__marker" aria-hidden="true">
                    {alert.severity === "critical" ? "!" : "i"}
                  </span>
                  <div>
                    <strong>{alert.title}</strong>
                    <p>{alert.detail}</p>
                    <time dateTime={alert.createdAt}>
                      {formatRelativeTime(alert.createdAt)}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel policy-panel">
          <div className="panel-heading panel-heading--policy">
            <div>
              <p className="section-kicker">Controller rules</p>
              <h2>Watering policy</h2>
            </div>
            <span className={`mode-badge mode-badge--${snapshot.policy.mode}`}>
              {MODE_LABELS[snapshot.policy.mode]}
            </span>
          </div>
          <PolicyEditor
            key={`${snapshot.zone.id}-${snapshot.policy.mode}-${snapshot.policy.dryThresholdPercent}-${snapshot.policy.targetMoisturePercent}-${snapshot.policy.doseMl}-${snapshot.policy.minimumHoursBetweenRuns}-${snapshot.policy.dailyLimitMl}-${snapshot.policy.rainSuppressionEnabled}`}
            policy={snapshot.policy}
            saving={savingPolicy}
            readOnly={source === "demo"}
            onSave={savePolicy}
          />
        </section>

        <section className="panel history-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Pump log</p>
              <h2>Watering history</h2>
            </div>
            <span className="panel-muted">
              {snapshot.wateringEvents.length} recent
            </span>
          </div>
          {snapshot.wateringEvents.length === 0 ? (
            <div className="empty-state empty-state--plain">
              <div>
                <strong>No watering runs yet</strong>
                <p>Your first completed dose will appear here.</p>
              </div>
            </div>
          ) : (
            <div className="history-table-wrap">
              <table className="history-table">
                <thead>
                  <tr>
                    <th scope="col">Started</th>
                    <th scope="col">Reason</th>
                    <th scope="col">Volume</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.wateringEvents.slice(0, 6).map((event) => (
                    <tr key={event.id}>
                      <td>{formatDateTime(event.startedAt)}</td>
                      <td className="capitalize">{event.reason}</td>
                      <td>
                        {event.deliveredMl ?? event.requestedMl} mL
                        {event.deliveredMl === null && <small> requested</small>}
                      </td>
                      <td>
                        <span className={`run-status run-status--${event.status}`}>
                          {event.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <footer className="dashboard-footer">
        <span>Sprout Pilot · One-zone bench prototype</span>
        <span>
          Firmware {snapshot.device.firmwareVersion} · Weather updated{" "}
          {formatRelativeTime(snapshot.weather.observedAt)}
        </span>
      </footer>

      {confirmingWater && (
        <ConfirmWaterDialog
          doseMl={snapshot.policy.doseMl}
          busy={sendingWater}
          onCancel={() => setConfirmingWater(false)}
          onConfirm={sendWaterCommand}
        />
      )}
    </main>
  );
}
