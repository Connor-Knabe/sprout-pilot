import { env } from "cloudflare:workers";

export interface ParticleDispatchResult {
  mode: "mock" | "particle";
  accepted: boolean;
  reason: string | null;
  failureStatus: number | null;
}

function serverEnv(name: string): string | null {
  const value = (env as Record<string, unknown>)[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function dispatchWaterCommand(
  commandId: string,
  doseMl: number,
  expiresAt: string,
): Promise<ParticleDispatchResult> {
  const deviceId = serverEnv("PARTICLE_DEVICE_ID");
  const accessToken = serverEnv("PARTICLE_ACCESS_TOKEN");

  if (!deviceId && !accessToken) {
    return {
      mode: "mock",
      accepted: true,
      reason: null,
      failureStatus: null,
    };
  }
  if (!deviceId || !accessToken) {
    return {
      mode: "particle",
      accepted: false,
      reason:
        "Particle integration is incomplete. Set both PARTICLE_DEVICE_ID and PARTICLE_ACCESS_TOKEN.",
      failureStatus: 503,
    };
  }

  if (serverEnv("ALLOW_REMOTE_WATERING") !== "true") {
    return {
      mode: "particle",
      accepted: false,
      reason:
        "Remote watering is disabled. Set ALLOW_REMOTE_WATERING=true only after controller interlocks are tested.",
      failureStatus: 403,
    };
  }

  const expiresAtEpoch = Math.floor(Date.parse(expiresAt) / 1_000);
  const argument = `${commandId}|${doseMl}|${expiresAtEpoch}`;
  if (argument.length > 63) {
    return {
      mode: "particle",
      accepted: false,
      reason: "Particle water command exceeds the controller's 63-character limit.",
      failureStatus: 400,
    };
  }

  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 8_000);
  try {
    const response = await fetch(
      `https://api.particle.io/v1/devices/${encodeURIComponent(deviceId)}/water`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ arg: argument }),
        signal: abort.signal,
      },
    );

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        mode: "particle",
        accepted: false,
        reason: `Particle Cloud rejected the command with HTTP ${response.status}.`,
        failureStatus: 502,
      };
    }

    const returnValue =
      typeof payload === "object" &&
      payload !== null &&
      "return_value" in payload &&
      typeof payload.return_value === "number"
        ? payload.return_value
        : null;
    if (returnValue === null || returnValue <= 0) {
      return {
        mode: "particle",
        accepted: false,
        reason:
          returnValue === null
            ? "Particle Cloud response omitted the controller return value."
            : `Controller rejected the command with code ${returnValue}.`,
        failureStatus: 409,
      };
    }

    return {
      mode: "particle",
      accepted: true,
      reason: null,
      failureStatus: null,
    };
  } catch (error) {
    return {
      mode: "particle",
      accepted: false,
      reason:
        error instanceof Error && error.name === "AbortError"
          ? "Particle Cloud command timed out after 8 seconds."
          : "Particle Cloud command failed before the controller acknowledged it.",
      failureStatus: 502,
    };
  } finally {
    clearTimeout(timeout);
  }
}
