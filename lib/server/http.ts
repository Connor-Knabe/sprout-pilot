import { DatabaseUnavailableError } from "@/db";
import { ApiError, isMissingDatabaseSchema } from "./errors";

export function jsonError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  let value: unknown;

  try {
    value = await request.json();
  } catch {
    throw new ApiError(
      400,
      "invalid_json",
      "Request body must contain valid JSON.",
    );
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ApiError(
      400,
      "invalid_body",
      "Request body must be a JSON object.",
    );
  }

  return value as Record<string, unknown>;
}

export function routeError(error: unknown): Response {
  if (error instanceof ApiError) {
    return jsonError(error.status, error.code, error.message);
  }

  if (error instanceof DatabaseUnavailableError) {
    return jsonError(503, "database_unavailable", error.message);
  }

  if (isMissingDatabaseSchema(error)) {
    return jsonError(
      503,
      "database_not_initialized",
      "Plant database tables are missing. Apply the generated Drizzle migration, then retry.",
    );
  }

  console.error("Plant API request failed", error);
  return jsonError(
    500,
    "internal_error",
    "Plant API request failed. Check server logs for the underlying error.",
  );
}
