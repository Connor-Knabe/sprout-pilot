import { env } from "cloudflare:workers";
import type { WeatherSnapshot } from "@/lib/contracts";

interface OpenMeteoPayload {
  current?: {
    time?: string;
    temperature_2m?: number;
    relative_humidity_2m?: number;
    weather_code?: number;
  };
  hourly?: {
    precipitation_probability?: number[];
    precipitation?: number[];
  };
}

interface CachedWeather {
  key: string;
  expiresAt: number;
  snapshot: WeatherSnapshot;
}

let cache: CachedWeather | null = null;

function serverEnv(name: string): string | null {
  const value = (env as Record<string, unknown>)[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function configuredCoordinate(name: string, minimum: number, maximum: number) {
  const value = serverEnv(name);
  if (value === null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

function conditionFor(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 3) return "Partly cloudy";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 67) return "Drizzle or rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code >= 85 && code <= 86) return "Snow showers";
  if (code >= 95) return "Thunderstorm";
  return "Unknown conditions";
}

function numbers(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is number =>
          typeof entry === "number" && Number.isFinite(entry),
      )
    : [];
}

function parseSnapshot(payload: OpenMeteoPayload): WeatherSnapshot | null {
  const current = payload.current;
  if (
    !current ||
    typeof current.time !== "string" ||
    typeof current.temperature_2m !== "number" ||
    typeof current.relative_humidity_2m !== "number" ||
    typeof current.weather_code !== "number"
  ) {
    return null;
  }

  const precipitation = numbers(payload.hourly?.precipitation).slice(0, 12);
  const probabilities = numbers(
    payload.hourly?.precipitation_probability,
  ).slice(0, 12);
  const precipitationNext12HoursMm = precipitation.reduce(
    (total, value) => total + value,
    0,
  );
  const precipitationProbabilityPercent = probabilities.length
    ? Math.max(...probabilities)
    : 0;
  const parsedTime = Date.parse(
    current.time.endsWith("Z") ? current.time : `${current.time}Z`,
  );

  return {
    observedAt: Number.isFinite(parsedTime)
      ? new Date(parsedTime).toISOString()
      : new Date().toISOString(),
    temperatureC: current.temperature_2m,
    relativeHumidityPercent: current.relative_humidity_2m,
    precipitationProbabilityPercent,
    precipitationNext12HoursMm,
    condition: conditionFor(current.weather_code),
    wateringSuppressed:
      precipitationProbabilityPercent >= 60 ||
      precipitationNext12HoursMm >= 2,
  };
}

export async function fetchConfiguredWeather(): Promise<WeatherSnapshot | null> {
  const latitude = configuredCoordinate("WEATHER_LATITUDE", -90, 90);
  const longitude = configuredCoordinate("WEATHER_LONGITUDE", -180, 180);
  if (latitude === null || longitude === null) {
    return null;
  }

  const key = `${latitude},${longitude}`;
  const now = Date.now();
  if (cache?.key === key && cache.expiresAt > now) {
    return cache.snapshot;
  }

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,weather_code",
  );
  url.searchParams.set(
    "hourly",
    "precipitation_probability,precipitation",
  );
  url.searchParams.set("forecast_hours", "12");
  url.searchParams.set("timezone", "UTC");

  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 3_000);
  try {
    const response = await fetch(url, { signal: abort.signal });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as OpenMeteoPayload;
    const snapshot = parseSnapshot(payload);
    if (snapshot) {
      cache = { key, expiresAt: now + 30 * 60_000, snapshot };
    }
    return snapshot;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
