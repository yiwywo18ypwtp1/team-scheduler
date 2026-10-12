import { z } from "zod";
import { parseIsoWithOffset } from "@/lib/time/zoned";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const instant = z
  .string()
  .refine((value) => parseIsoWithOffset(value) !== undefined, "Expected ISO 8601 with offset");

/** POST /api/conflicts body. Also used by the event form's warning check. */
export const conflictsQuerySchema = z
  .object({
    start: instant,
    end: instant,
    attendeeIds: z.array(z.string().min(1)).max(50).default([]),
    roomId: z.string().min(1).optional(),
    /** The event being edited, so it doesn't conflict with itself. */
    ignoreEventId: z.string().min(1).optional(),
  })
  .refine(({ start, end }) => Date.parse(end) > Date.parse(start), { message: "`end` must be after `start`", path: ["end"] })
  .refine(({ start, end }) => Date.parse(end) - Date.parse(start) <= WEEK_MS, {
    message: "Check at most 7 days at once",
    path: ["end"],
  });

export type ConflictsQuery = z.input<typeof conflictsQuerySchema>;
