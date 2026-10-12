import { addDaysToDateKey, dateKeyInTimeZone, type DateKey } from "@/lib/time/zoned";
import type { CalendarEvent } from "@/types/domain";

const DAY_MS = 24 * 60 * 60 * 1000;

/** All-day events and events of 24 h or longer go to the strip above the time grid. */
export function isStripEvent(event: CalendarEvent): boolean {
  return event.allDay || Date.parse(event.end) - Date.parse(event.start) >= DAY_MS;
}

/**
 * First and last calendar day (inclusive) an event touches.
 *
 * All-day events are floating dates: "Oct 12" stays Oct 12 in any display
 * timezone. Their ISO strings are written in the event's own timezone, so the
 * date part is the local date. `end` is exclusive (midnight after the last day).
 *
 * Timed events are real instants and are converted to the display timezone.
 */
export function eventDaySpan(
  event: CalendarEvent,
  timeZone: string,
): { first: DateKey; last: DateKey } {
  if (event.allDay) {
    const first = event.start.slice(0, 10);
    const last = addDaysToDateKey(event.end.slice(0, 10), -1);
    return { first, last: last < first ? first : last };
  }
  return {
    first: dateKeyInTimeZone(Date.parse(event.start), timeZone),
    // `end` is exclusive: an event ending at midnight doesn't touch the next day.
    last: dateKeyInTimeZone(Date.parse(event.end) - 1, timeZone),
  };
}

/** Index range [startIndex, endIndex) of a day span within contiguous `days`, or null if not visible. */
export function spanIndexes(
  span: { first: DateKey; last: DateKey },
  days: readonly DateKey[],
): { startIndex: number; endIndex: number } | null {
  const firstVisible = days[0];
  const lastVisible = days.at(-1);
  if (!firstVisible || !lastVisible) return null;
  // DateKeys compare correctly as strings.
  if (span.last < firstVisible || span.first > lastVisible) return null;

  return {
    startIndex: span.first <= firstVisible ? 0 : days.indexOf(span.first),
    endIndex: span.last >= lastVisible ? days.length : days.indexOf(span.last) + 1,
  };
}
