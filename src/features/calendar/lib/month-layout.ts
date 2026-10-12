import { dateKeyInTimeZone, type DateKey } from "@/lib/time/zoned";
import type { CalendarEvent } from "@/types/domain";
import { eventDaySpan, isStripEvent, spanIndexes } from "./event-days";
import { assignLanes } from "./layout-lanes";

/**
 * Lanes shown per week row; the rest go behind "+N more". A fixed number keeps
 * the layout a pure function. Measuring cell height in the browser would need
 * client-side layout code for little gain.
 */
export const MONTH_VISIBLE_LANES = 3;

export type MonthBar = {
  event: CalendarEvent;
  /** Day columns within the week row: [startIndex, endIndex). */
  startIndex: number;
  endIndex: number;
  lane: number;
};

export type MonthWeekLayout = {
  days: DateKey[];
  /** Bars in visible lanes only. */
  bars: MonthBar[];
  /** Per day: how many events are hidden behind "+N more". */
  hiddenCounts: number[];
  /** Per day: all events of that day, for the "+N more" popover. */
  eventsByDay: CalendarEvent[][];
};

/** Short timed events show on their start day only, even if they cross midnight. */
function monthDaySpan(event: CalendarEvent, timeZone: string) {
  if (isStripEvent(event)) return eventDaySpan(event, timeZone);
  const day = dateKeyInTimeZone(Date.parse(event.start), timeZone);
  return { first: day, last: day };
}

export function buildMonthLayout({
  events,
  days,
  timeZone,
  visibleLanes = MONTH_VISIBLE_LANES,
}: {
  events: readonly CalendarEvent[];
  days: readonly DateKey[];
  timeZone: string;
  visibleLanes?: number;
}): MonthWeekLayout[] {
  // All-day/multi-day first, then by start time, so lane ties are predictable.
  const ordered = [...events].sort(
    (a, b) =>
      Number(isStripEvent(b)) - Number(isStripEvent(a)) ||
      Date.parse(a.start) - Date.parse(b.start),
  );

  const weeks: MonthWeekLayout[] = [];
  for (let offset = 0; offset < days.length; offset += 7) {
    const weekDays = days.slice(offset, offset + 7);

    const spans = ordered.flatMap((event) => {
      const indexes = spanIndexes(monthDaySpan(event, timeZone), weekDays);
      return indexes ? [{ event, ...indexes }] : [];
    });

    const lanes = assignLanes(spans.map(({ event, ...indexes }) => ({ id: event.id, ...indexes })));
    const placed = spans.map((span) => ({ ...span, lane: lanes.get(span.event.id) ?? 0 }));

    const hiddenCounts = weekDays.map(() => 0);
    const eventsByDay: CalendarEvent[][] = weekDays.map(() => []);
    for (const bar of placed) {
      for (let index = bar.startIndex; index < bar.endIndex; index++) {
        eventsByDay[index]?.push(bar.event);
        if (bar.lane >= visibleLanes) hiddenCounts[index] = (hiddenCounts[index] ?? 0) + 1;
      }
    }

    weeks.push({
      days: weekDays,
      bars: placed.filter((bar) => bar.lane < visibleLanes),
      hiddenCounts,
      eventsByDay,
    });
  }
  return weeks;
}
