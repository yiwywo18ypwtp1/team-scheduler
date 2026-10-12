"use server";

import { redirect } from "next/navigation";
import { toApiError, type ActionResult } from "@/lib/errors";
import { getNow } from "@/lib/time/now";
import { cancelBooking, createBooking } from "@/server/booking";
import { simulateNetwork } from "@/server/mock-network";

/** Called from the static booking page. `values` is untrusted input. */
export async function createBookingAction(
  slug: string,
  values: unknown,
): Promise<ActionResult<{ id: string; token: string }>> {
  try {
    await simulateNetwork();
    const booking = createBooking(slug, values, getNow());
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
