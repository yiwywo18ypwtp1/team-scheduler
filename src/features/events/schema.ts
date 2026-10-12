import { z } from "zod";
import type { Interval } from "@/lib/intervals";
import {
  addDaysToDateKey,
  isValidDateKey,
  isValidTimeZone,
  wallTimeToInstant,
} from "@/lib/time/zoned";
import { assertValidRRule } from "@/lib/recurrence/expand";
import type { Room } from "@/types/domain";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One schema for the event form, the Server Actions and POST/PATCH /api/events.
 *
 * Times are wall-clock values plus an IANA timezone, the way people describe
 * a meeting ("10:00 in Kyiv"). Instants are resolved once, in
 * `formValuesToInterval`. This keeps the form plain (native date/time inputs)
 * and makes changing the timezone keep the wall-clock time.
 */
const dateField = z.string().refine(isValidDateKey, "Enter a valid date");
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const timeField = z.string().regex(TIME_PATTERN, "Enter a valid time");

export const eventLocationSchema = z.discriminatedUnion("kind", [
  // "none" instead of `undefined`, so the form always has a value for the kind select.
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("room"), roomId: z.string().min(1, "Choose a room") }),
  z.object({
    kind: z.literal("url"),
    // Only http(s): "javascript:" is a valid URL too, and this one becomes a link.
    url: z.url({ protocol: /^https?$/, message: "Enter a valid http(s) URL" }),
  }),
]);

export const recurrenceSchema = z.object({
  freq: z.enum(["none", "daily", "weekly", "monthly", "yearly", "custom"]),
  interval: z.number({ message: "Enter a number" }).int().min(1, "At least 1").max(99, "At most 99"),
  weekdays: z.array(z.number().int().min(0).max(6)),
  monthlyMode: z.enum(["dayOfMonth", "nthWeekday", "lastWeekday"]),
  end: z.enum(["never", "count", "until"]),
  count: z.number({ message: "Enter a number" }).int().min(1, "At least 1").max(999, "At most 999"),
  until: z.string(),
  custom: z.string(),
});

export const eventFormSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200, "Title is too long"),
    description: z.string().max(5000, "Description is too long"),
    allDay: z.boolean(),
    startDate: dateField,
    startTime: timeField,
    /** For all-day events: the last day, inclusive. */
    endDate: dateField,
    endTime: timeField,
    timezone: z.string().refine(isValidTimeZone, "Unknown timezone"),
    attendeeIds: z.array(z.string().min(1)).min(1, "Add at least one attendee"),
    location: eventLocationSchema,
    /** Edited as a structure; serialized to an RRULE when saved. */
    recurrence: recurrenceSchema,
  })
  .superRefine((values, ctx) => {
    const { recurrence } = values;
    if (recurrence.freq === "weekly" && recurrence.weekdays.length === 0) {
      ctx.addIssue({ code: "custom", path: ["recurrence", "weekdays"], message: "Pick at least one day" });
    }
    if (recurrence.freq !== "none" && recurrence.freq !== "custom" && recurrence.end === "until") {
      if (!isValidDateKey(recurrence.until)) {
        ctx.addIssue({ code: "custom", path: ["recurrence", "until"], message: "Enter a valid date" });
      } else if (isValidDateKey(values.startDate) && recurrence.until < values.startDate) {
        ctx.addIssue({ code: "custom", path: ["recurrence", "until"], message: "Must not be before the start date" });
      }
    }
    if (recurrence.freq === "custom") {
      try {
        assertValidRRule(recurrence.custom);
      } catch {
        ctx.addIssue({ code: "custom", path: ["recurrence", "custom"], message: "This repeat rule is not valid" });
      }
    }
  })
  .superRefine((values, ctx) => {
    // Zod still runs this when a field failed a regex/refine check, so skip
    // if the interval can't be computed; those fields already have errors.
    if (![values.startDate, values.endDate].every(isValidDateKey)) return;
    if (![values.startTime, values.endTime].every((time) => TIME_PATTERN.test(time))) return;
    if (!isValidTimeZone(values.timezone)) return;

    const { start, end } = formValuesToInterval(values);
    if (end <= start) {
      ctx.addIssue({
        code: "custom",
        path: [values.allDay ? "endDate" : "endTime"],
        message: values.allDay ? "End date must not be before start date" : "End must be after start",
      });
    } else if (!values.allDay && end - start > DAY_MS) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "Event can't be longer than 24 hours" });
    }
  });

export type EventFormValues = z.infer<typeof eventFormSchema>;

/**
 * Adds the room-capacity rule, which needs room data. The client builds it
 * from the rooms it received as props, the server from the database, so both
 * sides check the same rule.
 */
export function makeEventFormSchema(rooms: readonly Pick<Room, "id" | "capacity">[]) {
  return eventFormSchema.superRefine((values, ctx) => {
    if (values.location.kind !== "room") return;
    const { roomId } = values.location;
    const room = rooms.find((candidate) => candidate.id === roomId);
    if (!room) {
      ctx.addIssue({ code: "custom", path: ["location", "roomId"], message: "Unknown room" });
    } else if (room.capacity < values.attendeeIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["location", "roomId"],
        message: `Room fits ${room.capacity}, but there are ${values.attendeeIds.length} attendees`,
      });
    }
  });
}

/**
 * Resolves the wall-clock fields to UTC instants. All-day events run from
 * local midnight of the first day to local midnight after the last day.
 */
export function formValuesToInterval(
  values: Pick<
    EventFormValues,
    "allDay" | "startDate" | "startTime" | "endDate" | "endTime" | "timezone"
  >,
): Interval {
  if (values.allDay) {
    return {
      start: wallTimeToInstant(values.startDate, "00:00", values.timezone),
      end: wallTimeToInstant(addDaysToDateKey(values.endDate, 1), "00:00", values.timezone),
    };
  }
  return {
    start: wallTimeToInstant(values.startDate, values.startTime, values.timezone),
    end: wallTimeToInstant(values.endDate, values.endTime, values.timezone),
  };
}
