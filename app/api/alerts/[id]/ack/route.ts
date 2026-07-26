import { requireD1 } from "@/db";
import { ApiError } from "@/lib/server/errors";
import { authorizeControlRequest } from "@/lib/server/auth";
import { routeError } from "@/lib/server/http";
import { acknowledgeAlert } from "@/lib/server/plant-repository";
import { validateAlertId } from "@/lib/server/validation";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    authorizeControlRequest(request);
    const { id } = await context.params;
    const alert = await acknowledgeAlert(requireD1(), validateAlertId(id));
    if (!alert) {
      throw new ApiError(404, "alert_not_found", "Alert was not found.");
    }
    return Response.json(alert);
  } catch (error) {
    return routeError(error);
  }
}
