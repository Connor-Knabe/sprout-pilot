import { requireD1 } from "@/db";
import { authorizeControlRequest } from "@/lib/server/auth";
import { readJsonObject, routeError } from "@/lib/server/http";
import { dispatchWaterCommand } from "@/lib/server/particle";
import {
  findWaterCommand,
  getWaterSafetyContext,
  queueWaterCommand,
  rejectWaterCommand,
} from "@/lib/server/plant-repository";
import {
  assertWaterCommandFresh,
  validateWaterCommand,
} from "@/lib/server/validation";
import { assertWateringSafe } from "@/lib/server/watering";

export async function POST(request: Request) {
  try {
    authorizeControlRequest(request);
    const now = new Date();
    const command = validateWaterCommand(
      await readJsonObject(request),
      now,
      false,
    );
    const db = requireD1();
    const existing = await findWaterCommand(db, command.commandId);
    if (existing) {
      return Response.json(existing);
    }

    assertWaterCommandFresh(command, now);
    assertWateringSafe(command, await getWaterSafetyContext(db, now), now);
    const queued = await queueWaterCommand(db, command, now);
    const dispatch = await dispatchWaterCommand(
      command.commandId,
      command.doseMl,
      command.expiresAt,
    );
    if (!dispatch.accepted) {
      const rejected = await rejectWaterCommand(
        db,
        command.commandId,
        dispatch.reason ?? "Controller rejected the command.",
      );
      return Response.json(rejected, { status: dispatch.failureStatus ?? 409 });
    }

    return Response.json(queued, { status: 202 });
  } catch (error) {
    return routeError(error);
  }
}
