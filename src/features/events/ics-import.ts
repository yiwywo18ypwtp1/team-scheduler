import { defaultRecurrence, rruleToRecurrence } from "@/lib/recurrence/rule";
import {
  addDaysToDateKey,
  isValidDateKey,
  isValidTimeZone,
  wallTimeToInstant,
  type DateKey,
} from "@/lib/time/zoned";
import { toWallFields } from "./form-values";
import type { EventFormValues } from "./schema";

export type ImportedEvent = { values: EventFormValues; summary: string };
export type IcsParseResult = { events: ImportedEvent[]; skipped: string[] };

const MINUTE_MS = 60 * 1000;
const MAX_EVENTS = 200;

type Property = { name: string; params: Record<string, string>; value: string };

/** RFC 5545 line unfolding: a CRLF followed by a space or tab continues the previous line. */
function unfold(text: string): string[] {
  return text.replace(/\r\n|\r/g, "\n").replace(/\n[ \t]/g, "").split("\n").filter(Boolean);
}

function parseProperty(line: string): Property | null {
  const colon = line.indexOf(":");
  if (colon <= 0) return null;
  const [name = "", ...paramParts] = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const part of paramParts) {
    const [key, value] = part.split("=");
    if (key && value) params[key.toUpperCase()] = value.replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

function unescapeText(value: string): string {
  return value.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
}

/** A DTSTART/DTEND value as an instant, or as a date for VALUE=DATE. */
function parseDateTime(property: Property, fallbackTimeZone: string): { date: DateKey; instant?: number; timeZone: string } | null {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(property.value.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, , utc] = match;
  const date = `${year}-${month}-${day}`;
  if (!isValidDateKey(date)) return null;
  if (hour === undefined) return { date, timeZone: fallbackTimeZone }; // all-day
  const time = `${hour}:${minute}`;
  if (utc) return { date, instant: wallTimeToInstant(date, time, "UTC"), timeZone: fallbackTimeZone };
  // TZID wall time; an unknown or missing TZID is read as "floating" local time.
  const zone = property.params.TZID && isValidTimeZone(property.params.TZID) ? property.params.TZID : fallbackTimeZone;
  return { date, instant: wallTimeToInstant(date, time, zone), timeZone: zone };
}

/** ISO 8601 durations used in calendars: P1D, PT1H30M, P1W. */
function parseDurationMinutes(value: string): number | undefined {
  const match = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:\d+S)?)?$/.exec(value.trim());
  if (!match) return undefined;
  const [, weeks = "0", days = "0", hours = "0", minutes = "0"] = match;
  return ((Number(weeks) * 7 + Number(days)) * 24 + Number(hours)) * 60 + Number(minutes);
}

/**
 * Parses an iCalendar file into event form values for the current user.
 * Times with "Z" are shown in `timeZone`; TZID times keep their zone.
 * Events that can't be read are skipped and listed with the reason, the
 * rest still import. The server validates every event again on import.
 */
export function parseIcs(text: string, { timeZone, attendeeId }: { timeZone: string; attendeeId: string }): IcsParseResult {
  const events: ImportedEvent[] = [];
  const skipped: string[] = [];
  let current: Property[] | null = null;

  for (const line of unfold(text)) {
    if (/^BEGIN:VEVENT$/i.test(line)) current = [];
    else if (/^END:VEVENT$/i.test(line) && current) {
      const result = toEvent(current, timeZone, attendeeId);
      if (typeof result === "string") skipped.push(result);
      else if (events.length < MAX_EVENTS) events.push(result);
      else skipped.push(`${result.summary}: more than ${MAX_EVENTS} events in one file`);
      current = null;
    } else if (current) {
      const property = parseProperty(line);
      if (property) current.push(property);
    }
  }
  return { events, skipped };
}

function toEvent(properties: Property[], timeZone: string, attendeeId: string): ImportedEvent | string {
  const get = (name: string) => properties.find((property) => property.name === name);
  const summary = unescapeText(get("SUMMARY")?.value ?? "").trim() || "Untitled event";
  const startProperty = get("DTSTART");
  const start = startProperty && parseDateTime(startProperty, timeZone);
  if (!start) return `${summary}: missing or unreadable start (DTSTART)`;

  const endProperty = get("DTEND");
  const end = endProperty ? parseDateTime(endProperty, start.timeZone) : null;
  const durationMinutes = get("DURATION") ? parseDurationMinutes(get("DURATION")!.value) : undefined;
  const allDay = start.instant === undefined;

  let fields: Pick<EventFormValues, "startDate" | "startTime" | "endDate" | "endTime">;
  if (allDay) {
    // DTEND of an all-day event is exclusive; the form wants the last day.
    const days = durationMinutes ? Math.max(Math.round(durationMinutes / (24 * 60)), 1) : 1;
    const endDate = end ? addDaysToDateKey(end.date, -1) : addDaysToDateKey(start.date, days - 1);
    fields = { startDate: start.date, startTime: "00:00", endDate: endDate < start.date ? start.date : endDate, endTime: "00:00" };
  } else {
    const startInstant = start.instant as number;
    const endInstant = end?.instant ?? startInstant + (durationMinutes ?? 60) * MINUTE_MS;
    fields = toWallFields(startInstant, endInstant, start.timeZone);
  }

  const rrule = get("RRULE")?.value;
  return {
    summary,
    values: {
      title: summary.slice(0, 200),
      description: unescapeText(get("DESCRIPTION")?.value ?? "").slice(0, 5000),
      allDay,
      ...fields,
      timezone: start.timeZone,
      attendeeIds: [attendeeId],
      location: { kind: "none" },
      recurrence: rrule ? rruleToRecurrence(rrule, fields.startDate) : defaultRecurrence(),
    },
  };
}
