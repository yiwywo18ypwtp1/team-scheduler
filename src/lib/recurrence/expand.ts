import { RRule } from "rrule";
import type { Interval } from "@/lib/intervals";
import { floatingToInstant, instantToFloating, toZonedIso } from "@/lib/time/zoned";
import type { CalendarEvent } from "@/types/domain";

const DAY_MS = 24 * 60 * 60 * 1000;
const OCCURRENCE_SEPARATOR = "@";

/** Id of one occurrence of a series: `<masterId>@<original start, epoch ms>`. */
export function occurrenceId(masterId: string, originalStart: number): string {
  return `${masterId}${OCCURRENCE_SEPARATOR}${originalStart}`;
}

export function parseOccurrenceId(id: string): { masterId: string; originalStart: number } | null {
  const index = id.lastIndexOf(OCCURRENCE_SEPARATOR);
  if (index <= 0) return null;
  const originalStart = Number(id.slice(index + 1));
  return Number.isInteger(originalStart) ? { masterId: id.slice(0, index), originalStart } : null;
}

const ALLOWED_FREQUENCIES = new Set([RRule.YEARLY, RRule.MONTHLY, RRule.WEEKLY, RRule.DAILY]);

/**
 * Throws on rules we don't accept from users: unparseable ones, and ones that
 * repeat more than once a day (HOURLY…SECONDLY, BYHOUR/BYMINUTE/BYSECOND).
 * Those could produce hundreds of thousands of occurrences per week.
 */
export function assertValidRRule(rrule: string) {
  const options = RRule.parseString(rrule.replace(/^RRULE:/i, ""));
  if (options.freq === undefined || !ALLOWED_FREQUENCIES.has(options.freq)) {
    throw new Error("Only daily, weekly, monthly and yearly rules are supported");
  }
  if (options.byhour != null || options.byminute != null || options.bysecond != null) {
    throw new Error("Rules repeating within a day are not supported");
  }
}

export type Occurrence = { start: number; end: number };

/**
 * Occurrences of a recurring event, as real instants.
 *
 * The rule runs in floating (wall-clock) time from the master's local start,
 * and each occurrence is converted back with the event's timezone. So a daily
 * 03:30 event stays at 03:30 local through DST: on the fall-back night it
 * happens once (the first 03:30), on the spring-forward night it moves to
 * 04:30 instead of disappearing. The duration is also kept in wall-clock time.
 */
export function occurrencesOf(
  { start, end, timezone, rrule, exdates = [] }: Pick<CalendarEvent, "start" | "end" | "timezone" | "rrule" | "exdates">,
  range: Interval,
  limit = Infinity,
): Occurrence[] {
  const startInstant = Date.parse(start);
  const endInstant = Date.parse(end);
  if (!rrule) {
    return startInstant < range.end && endInstant > range.start ? [{ start: startInstant, end: endInstant }] : [];
  }

  const floatingStart = instantToFloating(startInstant, timezone);
  const floatingDuration = instantToFloating(endInstant, timezone) - floatingStart;
  const rule = new RRule({
    ...RRule.parseString(rrule.replace(/^RRULE:/i, "")),
    dtstart: new Date(floatingStart),
  });
  const excluded = new Set(exdates.map((exdate) => Date.parse(exdate)));

  // Floating and real times differ by the UTC offset (< 1 day), so the window
  // is widened and each candidate is filtered precisely on real instants.
  // The filtering happens inside the iterator, so `limit` counts only
  // occurrences that are really returned and iteration stops right there.
  const occurrences: Occurrence[] = [];
  rule.between(new Date(range.start - DAY_MS - floatingDuration), new Date(range.end + DAY_MS), true, (candidate) => {
    const floating = candidate.getTime();
    const occurrence = {
      start: floatingToInstant(floating, timezone),
      end: floatingToInstant(floating + floatingDuration, timezone),
    };
    const isVisible =
      !excluded.has(occurrence.start) && occurrence.start < range.end && occurrence.end > range.start;
    if (isVisible) occurrences.push(occurrence);
    return occurrences.length < limit;
  });
  return occurrences;
}

/**
 * A stored event -> what the calendar shows in `range`: itself, or one
 * virtual event per occurrence of a series. Occurrences point to their master
 * through `seriesId`, carry no `rrule` (only the master has it) and share the
 * master's version, so edits are checked against the series.
 */
export function expandEvent(event: CalendarEvent, range: Interval): CalendarEvent[] {
  if (!event.rrule) return occurrencesOf(event, range).length > 0 ? [event] : [];

  let occurrences: Occurrence[];
  try {
    occurrences = occurrencesOf(event, range);
  } catch (error) {
    // A broken stored rule must not take the whole calendar down: show the
    // master once, as a single event, and leave a trace for whoever fixes it.
    console.warn(`Invalid RRULE on event ${event.id}: ${event.rrule}`, error);
    return occurrencesOf({ ...event, rrule: undefined }, range).length > 0
      ? [{ ...event, rrule: undefined }]
      : [];
  }

  return occurrences.map((occurrence) => ({
    ...event,
    id: occurrenceId(event.id, occurrence.start),
    seriesId: event.id,
    rrule: undefined,
    exdates: undefined,
    start: toZonedIso(occurrence.start, event.timezone),
    end: toZonedIso(occurrence.end, event.timezone),
  }));
}
