import { z } from "zod";
import { isValidTimeZone, parseIsoWithOffset } from "@/lib/time/zoned";
import type { Question } from "@/types/domain";
import { buildAnswersSchema } from "./answers";

/** The slot, timezone and versioning parts of a booking request; answers are per page. */
const bookingRequestBase = z.object({
  start: z
    .string()
    .min(1, "Choose a time")
    .refine((value) => parseIsoWithOffset(value) !== undefined, "Choose a time"),
  duration: z.number().int().positive(),
  guestTimeZone: z.string().refine(isValidTimeZone, "Unknown timezone"),
  /** `questionsVersion()` of the questions the guest saw; optional for API clients. */
  questionsVersion: z.string().optional(),
});

/**
 * One schema for the booking form, the Server Action and POST /api/book/:slug,
 * built from the page's questions at runtime. The client builds it from the
 * questions it was rendered with, the server again from the current ones.
 * The form state has exactly this shape, so the chosen slot, timezone and
 * answers survive switching between the two steps.
 */
export function makeBookingRequestSchema(questions: readonly Question[]) {
  return bookingRequestBase.extend({ answers: buildAnswersSchema(questions) });
}

export type BookingRequest = z.input<ReturnType<typeof makeBookingRequestSchema>>;

/** GET /api/book/:slug/slots response. */
export type SlotsResponse = {
  timeZone: string;
  /** First and last shown day (inclusive) in `timeZone`. */
  from: string;
  to: string;
  /** Bounds for week navigation: today and the last bookable day. */
  firstDate: string;
  lastDate: string;
  slots: { start: string; end: string }[];
};
