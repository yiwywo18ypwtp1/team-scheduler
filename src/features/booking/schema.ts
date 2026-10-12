import { z } from "zod";
import { isValidTimeZone, parseIsoWithOffset } from "@/lib/time/zoned";

/**
 * Core level: a fixed questionnaire (name, email, notes). The Advanced level
 * replaces `answers` with a schema built at runtime from the page's questions.
 */
export const bookingAnswersSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(100, "Name is too long"),
  email: z.email("Enter a valid email"),
  notes: z.string().max(1000, "Keep it under 1000 characters"),
});

/**
 * One schema for the booking form, the Server Action and POST /api/book/:slug.
 * The form state has exactly this shape, so the chosen slot, timezone and
 * answers survive switching between the two steps.
 */
export const bookingRequestSchema = z.object({
  start: z
    .string()
    .min(1, "Choose a time")
    .refine((value) => parseIsoWithOffset(value) !== undefined, "Choose a time"),
  duration: z.number().int().positive(),
  guestTimeZone: z.string().refine(isValidTimeZone, "Unknown timezone"),
  answers: bookingAnswersSchema,
});

export type BookingRequest = z.infer<typeof bookingRequestSchema>;

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
