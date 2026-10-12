import { dayIntervalInTimeZone, type DateKey } from "@/lib/time/zoned";
import type { CalendarEvent } from "@/types/domain";
import { eventDaySpan, isStripEvent } from "./event-days";

export type AgendaRow =
  | { kind: "day"; key: string; date: DateKey }
  | { kind: "event"; key: string; date: DateKey; event: CalendarEvent }
  | { kind: "empty"; key: string; date: DateKey };

/**
 * Flat list for the virtualized agenda: a header per day that has events,
 * then its events by start time. Multi-day events appear on every day they
 * touch. Days without events are skipped, except `keepDates` (today, the
 * date the agenda was opened at), which get a "No events" row.
 */
export function buildAgendaRows(
  events: readonly CalendarEvent[],
  days: readonly DateKey[],
  timeZone: string,
  keepDates: readonly DateKey[] = [],
): AgendaRow[] {
  const rows: AgendaRow[] = [];
  for (const date of days) {
    const day = dayIntervalInTimeZone(date, timeZone);
    const onDay = events
      .filter((event) => {
        if (isStripEvent(event)) {
          const span = eventDaySpan(event, timeZone);
          return span.first <= date && date <= span.last;
        }
        return Date.parse(event.start) < day.end && Date.parse(event.end) > day.start;
      })
      .sort((a, b) => Number(b.allDay) - Number(a.allDay) || Date.parse(a.start) - Date.parse(b.start));

    if (onDay.length === 0 && !keepDates.includes(date)) continue;
    rows.push({ kind: "day", key: `day:${date}`, date });
    if (onDay.length === 0) rows.push({ kind: "empty", key: `empty:${date}`, date });
    for (const event of onDay) rows.push({ kind: "event", key: `${date}:${event.id}`, date, event });
  }
  return rows;
}
