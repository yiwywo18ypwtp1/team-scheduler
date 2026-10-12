"use server";

import { z } from "zod";
import { DomainError, toApiError, validationError, type ActionResult } from "@/lib/errors";
import { isValidTimeZone } from "@/lib/time/zoned";
import { getMember } from "@/server/members";
import { simulateNetwork } from "@/server/mock-network";
import { saveSessionPreferences } from "@/server/session";

// Server-only schema: the form has only <select>s, so there is nothing
// to validate on the client; the server still must not trust the input.
const settingsSchema = z.object({
  userId: z.string().min(1, "Choose a user"),
  timeZone: z.union([
    z.literal(""),
    z.string().refine(isValidTimeZone, "Unknown timezone"),
  ]),
});

export async function saveSettings(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await simulateNetwork();

    const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw validationError(parsed.error);

    if (!getMember(parsed.data.userId)) {
      throw new DomainError("VALIDATION_ERROR", "Some fields are invalid", {
        userId: ["This member no longer exists"],
      });
    }

    await saveSessionPreferences(parsed.data);
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: toApiError(error).error };
  }
}
