"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { toApiError, type ActionResult } from "@/lib/errors";
import { parseScope } from "@/lib/recurrence/scope";
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

/** `scope` is required when `id` is one occurrence of a series. */
export async function updateEventAction(
  id: string,
  expectedVersion: number,
  values: unknown,
  scope?: string,
): Promise<ActionResult<{ version: number }>> {
  try {
    await simulateNetwork();
    const { user } = await getSession();
    const event = updateEvent(id, values, { actorId: user.id, expectedVersion, scope: parseScope(scope) });
    revalidatePath("/calendar");
    return { ok: true, data: { version: event.version } };
  } catch (error) {
    return { ok: false, error: toApiError(error).error };
  }
}

export async function deleteEventAction(
  id: string,
  expectedVersion: number,
  scope?: string,
): Promise<ActionResult> {
  try {
    await simulateNetwork();
    const { user } = await getSession();
    deleteEvent(id, { actorId: user.id, expectedVersion, scope: parseScope(scope) });
    revalidatePath("/calendar");
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: toApiError(error).error };
  }
}

/**
 * Creates events parsed from an .ics file. Each event is validated on its
 * own, so one bad entry doesn't block the rest; failures come back by title.
 */
export async function importEventsAction(
  events: unknown,
): Promise<ActionResult<{ created: number; failed: string[] }>> {
  try {
    await simulateNetwork();
    const { user } = await getSession();
    const list = z.array(z.object({ summary: z.string(), values: z.unknown() })).max(200).parse(events);
    const failed: string[] = [];
    let created = 0;
    for (const { summary, values } of list) {
      try {
        createEvent(values, user.id);
        created += 1;
      } catch (error) {
        failed.push(`${summary}: ${toApiError(error).error.message}`);
      }
    }
    if (created > 0) revalidatePath("/calendar");
    return { ok: true, data: { created, failed } };
  } catch (error) {
    return { ok: false, error: toApiError(error).error };
  }
}
