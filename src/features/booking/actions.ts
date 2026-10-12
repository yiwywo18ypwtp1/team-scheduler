"use server";

import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { toApiError, type ActionResult } from "@/lib/errors";
import { getNow } from "@/lib/time/now";
import { cancelBooking, createBooking, updateBookingPage } from "@/server/booking";
import { getSession } from "@/server/session";
import { bookingPageTag } from "./page-schema";
import { simulateNetwork } from "@/server/mock-network";

/**
 * Called from the static booking page. `values` is untrusted input.
 * `idempotencyKey` makes double clicks and retries return the same booking.
 */
export async function createBookingAction(
  slug: string,
  values: unknown,
  idempotencyKey?: string,
): Promise<ActionResult<{ id: string; token: string }>> {
  try {
    await simulateNetwork();
    const { booking } = createBooking(slug, values, getNow(), idempotencyKey);
    return { ok: true, data: { id: booking.id, token: booking.cancelToken } };
  } catch (error) {
    return { ok: false, error: toApiError(error).error };
  }
}

/** Plain <form action>: works without JavaScript, then shows the page again with the new status. */
export async function cancelBookingAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("id") ?? "");
  const token = String(formData.get("token") ?? "");

  let error: string | undefined;
  try {
    cancelBooking(id, token);
  } catch (caught) {
    error = toApiError(caught).error.message;
  }
  // redirect() throws, so it must stay outside the try/catch.
  const search = new URLSearchParams({ token, ...(error ? { error } : {}) });
  redirect(`/book/${encodeURIComponent(slug)}/cancel/${encodeURIComponent(id)}?${search}`);
}

/** Owner-only save from the questionnaire builder; refreshes the static public page. */
export async function saveBookingPageAction(slug: string, settings: unknown): Promise<ActionResult> {
  try {
    await simulateNetwork();
    const { user } = await getSession();
    updateBookingPage(slug, settings, user.id);
    revalidateTag(bookingPageTag(slug), { expire: 0 });
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: toApiError(error).error };
  }
}
