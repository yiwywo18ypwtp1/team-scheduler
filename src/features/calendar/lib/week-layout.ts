import { intersectIntervals, type Interval } from "@/lib/intervals";
import { dayIntervalInTimeZone, type DateKey } from "@/lib/time/zoned";
import type { CalendarEvent } from "@/types/domain";
import { eventDaySpan, isStripEvent, spanIndexes } from "./event-days";
import { assignLanes } from "./layout-lanes";
import { layoutOverlappingEvents } from "./layout-overlaps";

const MINUTE_MS = 60 * 1000;

/** Part of a timed event inside one day column, in minutes from local midnight. */
export type TimedSegment = {
  event: CalendarEvent;
  /** The day column this segment is in. */
  date: DateKey;
  startMinute: number;
  endMinute: number;
  column: number;
  columnCount: number;
  /** The event started on an earlier day / ends on a later day. */
  continuesBefore: boolean;
  continuesAfter: boolean;
};

export type StripBar = {
  event: CalendarEvent;
  startIndex: number;
  endIndex: number;
  lane: number;
};

export type WeekDayLayout = {
  date: DateKey;
  /** Real length of the day: 23 or 25 h on DST days. */
  minutes: number;
  segments: TimedSegment[];
  /** Working-hours blocks inside this day, in minutes from local midnight. */
  workingBlocks: { startMinute: number; endMinute: number }[];
  /** UTC bounds of the day, for the current-time line. */
  interval: Interval;
};

export type WeekLayout = {
  days: WeekDayLayout[];
  strip: StripBar[];
  stripLaneCount: number;
};

/**
 * Everything the week view needs to render, computed up front so the
 * components stay simple. Positions are real elapsed minutes since local
 * midnight, not wall-clock hours, so DST days don't duplicate or lose events.
 */
export function buildWeekLayout({
  events,
  days,
  timeZone,
  workingHours,
}: {
  events: readonly CalendarEvent[];
  days: readonly DateKey[];
  timeZone: string;
  /** Current user's working time as UTC intervals. */
  workingHours: readonly Interval[];
}): WeekLayout {
  const stripEvents = events.filter(isStripEvent);
  const timedEvents = events.filter((event) => !isStripEvent(event));

  const spans = stripEvents.flatMap((event) => {
    const indexes = spanIndexes(eventDaySpan(event, timeZone), days);
    return indexes ? [{ event, ...indexes }] : [];
  });
  const lanes = assignLanes(spans.map(({ event, ...indexes }) => ({ id: event.id, ...indexes })));
  const strip = spans.map((span) => ({ ...span, lane: lanes.get(span.event.id) ?? 0 }));
  const stripLaneCount = strip.reduce((count, bar) => Math.max(count, bar.lane + 1), 0);

  const toMinutes = (instant: number, dayStart: number) => (instant - dayStart) / MINUTE_MS;

  const dayLayouts = days.map((date): WeekDayLayout => {
    const day = dayIntervalInTimeZone(date, timeZone);

    const pieces = timedEvents.flatMap((event) => {
      const start = Date.parse(event.start);
      const end = Date.parse(event.end);
      const clippedStart = Math.max(start, day.start);
      const clippedEnd = Math.min(end, day.end);
      if (clippedEnd <= clippedStart) return [];
      return [
        {
          event,
          start: clippedStart,
          end: clippedEnd,
          continuesBefore: start < day.start,
          continuesAfter: end > day.end,
        },
      ];
    });

    const placements = layoutOverlappingEvents(
      pieces.map(({ event, start, end }) => ({ id: event.id, start, end })),
    );

    return {
      date,
      interval: day,
      minutes: toMinutes(day.end, day.start),
      segments: pieces.map((piece) => ({
        event: piece.event,
        date,
        startMinute: toMinutes(piece.start, day.start),
        endMinute: toMinutes(piece.end, day.start),
        continuesBefore: piece.continuesBefore,
        continuesAfter: piece.continuesAfter,
        ...(placements.get(piece.event.id) ?? { column: 0, columnCount: 1 }),
      })),
      workingBlocks: intersectIntervals(workingHours, [day]).map((block) => ({
        startMinute: toMinutes(block.start, day.start),
        endMinute: toMinutes(block.end, day.start),
      })),
    };
  });

  return { days: dayLayouts, strip, stripLaneCount };
}
