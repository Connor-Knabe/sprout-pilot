import { getD1 } from "@/db";
import {
  buildMockDashboard,
  isDemoScenario,
} from "@/lib/server/mock-dashboard";
import { canUseDemoDashboard } from "@/lib/server/errors";
import { authorizeControlRequest } from "@/lib/server/auth";
import { jsonError, routeError } from "@/lib/server/http";
import { loadDashboard } from "@/lib/server/plant-repository";
import { fetchConfiguredWeather } from "@/lib/server/weather";

export async function GET(request: Request) {
  const now = new Date();
  const requestedScenario = new URL(request.url).searchParams.get("demo");
  if (requestedScenario !== null) {
    if (!isDemoScenario(requestedScenario)) {
      return jsonError(
        400,
        "invalid_demo_scenario",
        "Unknown demo scenario. Use healthy, dry, watering, rainy, tank-low, leak, sensor-fault, or offline.",
      );
    }
    return Response.json(
      buildMockDashboard({ now, scenario: requestedScenario }),
    );
  }

  const db = getD1();
  if (!db) {
    return Response.json(buildMockDashboard({ now }));
  }

  try {
    authorizeControlRequest(request);
    const { snapshot, policy } = await loadDashboard(db, now);
    const dashboard = snapshot ?? buildMockDashboard({ now, policy });
    dashboard.weather = (await fetchConfiguredWeather()) ?? dashboard.weather;
    return Response.json(dashboard);
  } catch (error) {
    if (canUseDemoDashboard(error)) {
      return Response.json(buildMockDashboard({ now }));
    }
    return routeError(error);
  }
}
