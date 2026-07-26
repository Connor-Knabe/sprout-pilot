import { requireD1 } from "@/db";
import { authorizeTelemetry } from "@/lib/server/auth";
import { readJsonObject, routeError } from "@/lib/server/http";
import { storeTelemetry } from "@/lib/server/plant-repository";
import { validateTelemetry } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    authorizeTelemetry(request);
    const now = new Date();
    const telemetry = validateTelemetry(await readJsonObject(request), now);
    const { deduplicated } = await storeTelemetry(requireD1(), telemetry, now);

    if (new URL(request.url).searchParams.get("source") === "particle") {
      return new Response(null, { status: 204 });
    }

    return Response.json(
      { accepted: true, deduplicated, eventId: telemetry.eventId },
      { status: deduplicated ? 200 : 201 },
    );
  } catch (error) {
    return routeError(error);
  }
}
