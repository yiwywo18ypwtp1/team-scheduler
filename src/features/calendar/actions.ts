"use server";

import { revalidatePath } from "next/cache";
import { toApiError, type ActionResult } from "@/lib/errors";
import { moveEvent } from "@/server/events";
import { simulateNetwork } from "@/server/mock-network";
import { getSession } from "@/server/session";

/** Drag-n-drop move. Instants are epoch ms; the server re-validates everything. */
export async function moveEventAction(
  id: string,
  expectedVersion: number,
  start: number,
  end: number,
): Promise<ActionResult<{ version: number }>> {
  try {
    await simulateNetwork();
    const { user } = await getSession();
    const event = moveEvent(id, { start, end }, { actorId: user.id, expectedVersion });
    revalidatePath("/calendar");
    return { ok: true, data: { version: event.version } };
  } catch (error) {
    return { ok: false, error: toApiError(error).error };
  }
}
