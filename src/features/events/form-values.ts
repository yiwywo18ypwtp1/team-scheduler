import {
  addDaysToDateKey,
  dateKeyInTimeZone,
  formatInTimeZone,
  isValidTimeZone,
  parseIsoWithOffset,
  toZonedIso,
} from "@/lib/time/zoned";
import type { CalendarEvent } from "@/types/domain";
import { formValuesToInterval, type EventFormValues } from "./schema";

const HALF_HOUR_MS = 30 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Instants -> the form's wall-clock date/time fields in `timeZone`. */
export function toWallFields(start: number, end: number, timeZone: string) {
  return {
    startDate: dateKeyInTimeZone(start, timeZone),
    startTime: formatInTimeZone(start, timeZone, "HH:mm"),
    endDate: dateKeyInTimeZone(end, timeZone),
    endTime: formatInTimeZone(end, timeZone, "HH:mm"),
  };
}

/** Existing event -> form values, shown in the event's own timezone. */
export function eventToFormValues(event: CalendarEvent): EventFormValues {
  const start = Date.parse(event.start);
  const end = Date.parse(event.end);
  const fields = toWallFields(start, end, event.timezone);

  return {
    title: event.title,
    description: event.description ?? "",
    allDay: event.allDay,
    ...fields,
    // Stored all-day end is exclusive (next midnight); the form shows the last day.
    endDate: event.allDay ? addDaysToDateKey(fields.endDate, -1) : fields.endDate,
    timezone: event.timezone,
    attendeeIds: event.attendees.map((attendee) => attendee.memberId),
    location: event.location ?? { kind: "none" },
  };
}

/** Form values -> the event fields they define (attendee statuses are set by the server). */
export function formValuesToEventFields(
  values: EventFormValues,
): Pick<CalendarEvent, "title" | "description" | "start" | "end" | "timezone" | "allDay" | "location"> {
  const { start, end } = formValuesToInterval(values);
  return {
    title: values.title.trim(),
    description: values.description.trim() || undefined,
    start: toZonedIso(start, values.timezone),
    end: toZonedIso(end, values.timezone),
    timezone: values.timezone,
    allDay: values.allDay,
    location: values.location.kind === "none" ? undefined : values.location,
  };
}

export type NewEventPrefill = {
  start?: string;
  end?: string;
  tz?: string;
  /** Comma-separated member ids. */
  attendees?: string;
};

/**
 * Defaults for a new event. Without a prefill: the next half hour, one hour
 * long, with the current user attending. The prefill comes from the URL
 * (e.g. a free slot picked on /find-time) and is ignored when invalid.
 */
export function newEventFormValues({
  now,
  timeZone,
  currentUserId,
  prefill = {},
}: {
  now: number;
  timeZone: string;
  currentUserId: string;
  prefill?: NewEventPrefill;
}): EventFormValues {
  const tz = prefill.tz && isValidTimeZone(prefill.tz) ? prefill.tz : timeZone;

  const prefillStart = prefill.start ? parseIsoWithOffset(prefill.start) : undefined;
  const prefillEnd = prefill.end ? parseIsoWithOffset(prefill.end) : undefined;
  // Rounding in UTC is also a round half hour in every whole and half-hour offset zone.
  const start = prefillStart ?? Math.ceil(now / HALF_HOUR_MS) * HALF_HOUR_MS;
  const end = prefillEnd !== undefined && prefillEnd > start ? prefillEnd : start + HOUR_MS;

  const prefillAttendees = prefill.attendees?.split(",").filter(Boolean) ?? [];
  const attendeeIds = [...new Set([currentUserId, ...prefillAttendees])];

  return {
    title: "",
    description: "",
    allDay: false,
    ...toWallFields(start, end, tz),
    timezone: tz,
    attendeeIds,
    location: { kind: "none" },
  };
}

type RawSearchParams = Record<string, string | string[] | undefined>;

/** Reads `?start&end&tz&attendees` for a new event; values are validated later. */
export function prefillFromSearchParams(searchParams: RawSearchParams): NewEventPrefill {
  const first = (key: string) => {
    const value = searchParams[key];
    return Array.isArray(value) ? value[0] : value;
  };
  return { start: first("start"), end: first("end"), tz: first("tz"), attendees: first("attendees") };
}
