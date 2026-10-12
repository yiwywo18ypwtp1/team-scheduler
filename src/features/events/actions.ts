"use server";

import { revalidatePath } from "next/cache";
import { toApiError, type ActionResult } from "@/lib/errors";
import { createEvent, deleteEvent, updateEvent } from "@/server/events";
import { simulateNetwork } from "@/server/mock-network";
import { getSession } from "@/server/session";

// Thin adapters: the session decides who acts, validation and rules live in
// server/events.ts. Expected failures come back as `{ ok: false }` instead of
// being thrown, so the form shows them locally rather than an error page.
// Inputs are `unknown`: a Server Action is a public endpoint like any other.

export async function createEventAction(values: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await simulateNetwork();
    const { user } = await getSession();
    const event = createEvent(values, user.id);
    revalidatePath("/calendar");
    return { ok: true, data: { id: event.id } };
  } catch (error) {
    return { ok: false, error: toApiError(error).error };
  }
}

export async function updateEventAction(
  id: string,
  expectedVersion: number,
  values: unknown,
): Promise<ActionResult<{ version: number }>> {
  try {
    await simulateNetwork();
    const { user } = await getSession();
    const event = updateEvent(id, values, { actorId: user.id, expectedVersion });
    revalidatePath("/calendar");
    return { ok: true, data: { version: event.version } };
  } catch (error) {
    return { ok: false, error: toApiError(error).error };
  }
}

export async function deleteEventAction(id: string, expectedVersion: number): Promise<ActionResult> {
  try {
    await simulateNetwork();
    const { user } = await getSession();
    deleteEvent(id, { actorId: user.id, expectedVersion });
    revalidatePath("/calendar");
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: toApiError(error).error };
  }
}
