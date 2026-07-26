import { requireD1 } from "@/db";
import { ApiError } from "@/lib/server/errors";
import { authorizeControlRequest } from "@/lib/server/auth";
import { readJsonObject, routeError } from "@/lib/server/http";
import { getPolicy, updatePolicy } from "@/lib/server/plant-repository";
import { validatePolicyUpdate } from "@/lib/server/validation";

export async function PATCH(request: Request) {
  try {
    authorizeControlRequest(request);
    const update = validatePolicyUpdate(await readJsonObject(request));
    const db = requireD1();
    const current = await getPolicy(db);
    if (update.mode === "automatic" && !current.calibrated) {
      throw new ApiError(
        409,
        "calibration_required",
        "Complete soil calibration before enabling automatic mode.",
      );
    }

    const policy = await updatePolicy(db, update);
    return Response.json(policy);
  } catch (error) {
    return routeError(error);
  }
}
