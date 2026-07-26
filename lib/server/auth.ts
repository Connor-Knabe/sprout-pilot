import { env } from "cloudflare:workers";
import { ApiError } from "./errors";

function serverEnv(name: string): string | null {
  const value = (env as Record<string, unknown>)[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isLoopbackRequest(request: Request): boolean {
  try {
    const hostname = new URL(request.url).hostname;
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1"
    );
  } catch {
    return false;
  }
}

function assertSameOrigin(request: Request): void {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ApiError(
      403,
      "cross_site_request_rejected",
      "Cross-site dashboard requests are not allowed.",
    );
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    return;
  }

  try {
    if (new URL(origin).origin === new URL(request.url).origin) {
      return;
    }
  } catch {
    // Invalid and opaque origins are rejected below.
  }

  throw new ApiError(
    403,
    "cross_site_request_rejected",
    "The request origin does not match the dashboard origin.",
  );
}

function constantTimeEqual(left: string, right: string): boolean {
  const maximumLength = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < maximumLength; index += 1) {
    difference |=
      (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export function authorizeTelemetry(request: Request): void {
  const expected = serverEnv("INGEST_TOKEN");
  if (!expected) {
    throw new ApiError(
      503,
      "ingest_not_configured",
      "Telemetry ingress is disabled until server environment variable INGEST_TOKEN is configured.",
    );
  }

  const authorization = request.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;
  const webhookSecret = request.headers.get("x-plant-ingest-token");
  const supplied = bearer ?? webhookSecret;

  if (!supplied || !constantTimeEqual(supplied, expected)) {
    throw new ApiError(
      401,
      "invalid_ingest_token",
      "Telemetry requires Authorization: Bearer <INGEST_TOKEN> or X-Plant-Ingest-Token.",
    );
  }
}

export function authorizeControlRequest(request: Request): void {
  if (serverEnv("ALLOW_INSECURE_LOCAL_CONTROL") === "true") {
    if (!isLoopbackRequest(request)) {
      throw new ApiError(
        403,
        "local_control_only",
        "The insecure development bypass is restricted to loopback requests.",
      );
    }
    assertSameOrigin(request);
    return;
  }

  if (serverEnv("REQUIRE_DASHBOARD_AUTH") !== "true") {
    throw new ApiError(
      503,
      "control_auth_not_configured",
      "Dashboard reads and controls are disabled until authentication is configured.",
    );
  }

  const allowedEmails = new Set(
    (serverEnv("DASHBOARD_ALLOWED_EMAILS") ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  if (allowedEmails.size === 0) {
    throw new ApiError(
      503,
      "dashboard_allowlist_not_configured",
      "Dashboard authentication requires at least one allowed account.",
    );
  }

  const email = request.headers.get("oai-authenticated-user-email")?.trim();
  if (!email) {
    throw new ApiError(
      401,
      "dashboard_auth_required",
      "This control endpoint requires an authenticated dashboard session.",
    );
  }

  if (!allowedEmails.has(email.toLowerCase())) {
    throw new ApiError(
      403,
      "dashboard_access_denied",
      "This authenticated account is not authorized for the dashboard.",
    );
  }

  assertSameOrigin(request);
}
