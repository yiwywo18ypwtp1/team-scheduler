"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import type { Interval } from "@/lib/intervals";
import { parseOccurrenceId } from "@/lib/recurrence/expand";
import { formatDateKey, formatInTimeZone, toZonedIso, type DateKey } from "@/lib/time/zoned";
import type { CalendarEvent } from "@/types/domain";
import { moveEventAction } from "../actions";
import { buildWeekLayout } from "../lib/week-layout";
import { eventToneClass } from "./event-style";
import { HOUR_HEIGHT_PX, MINUTE_HEIGHT_PX } from "./grid-constants";
import { NowLine } from "./NowLine";
import { ScrollArea } from "./ScrollArea";
import { TimedEventBlock } from "./TimedEventBlock";

type Props = {
  events: CalendarEvent[];
  days: DateKey[];
  timeZone: string;
  today: DateKey;
  currentUserId: string;
  workingHours: Interval[];
  mockNow?: number;
};

const GRID_COLUMNS = "grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]";
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

type Move = { id: string; start: number; end: number };

/**
 * Client Component because of drag-n-drop. Events still arrive from the
 * server as props; this component only layers optimistic moves on top.
 *
 * Optimistic flow: the moved event shows at its new place immediately.
 * - success: the action revalidates /calendar and fresh props replace the
 *   optimistic state in the same transition;
 * - failure: the props didn't change, so when the transition ends the event
 *   falls back to its old place by itself (rollback), and a toast explains why.
 */
export function WeekView({ events, days, timeZone, today, currentUserId, workingHours, mockNow }: Props) {
  const [optimisticEvents, applyMove] = useOptimistic(events, (current, move: Move) =>
    current.map((event) =>
      event.id === move.id
        ? { ...event, start: toZonedIso(move.start, event.timezone), end: toZonedIso(move.end, event.timezone) }
        : event,
    ),
  );
  const [isMoving, startTransition] = useTransition();
  // Element over the day columns, for drag geometry and the drag preview.
  // State (not a ref) because it is read while rendering the blocks.
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const layout = buildWeekLayout({ events: optimisticEvents, days, timeZone, workingHours });

  const moveEvent = (event: CalendarEvent, start: number, end: number) => {
    // Dragging an occurrence of a series moves only that occurrence (scope "this").
    const what = parseOccurrenceId(event.id) ? `this occurrence of ${event.title}` : event.title;
    const description = `${what} to ${formatInTimeZone(start, timeZone, "EEEE HH:mm")}`;
    startTransition(async () => {
      applyMove({ id: event.id, start, end });
      const result = await moveEventAction(event.id, event.version, start, end);
      if (result.ok) {
        setAnnouncement(`Moved ${description}`);
      } else {
        // Prefer the specific reason (e.g. "longer than 24 hours") over the generic message.
        const reason = Object.values(result.error.fieldErrors ?? {})[0]?.[0] ?? result.error.message;
        toast.error(`Couldn't move "${event.title}": ${reason}`);
        setAnnouncement(`Couldn't move ${description}. ${reason}`);
      }
    });
  };

  return (
    <div
      role="grid"
      aria-readonly
      aria-label={`Week of ${formatDateKey(days[0] ?? today, "MMMM d, yyyy")}`}
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800"
    >
      <div role="row" className={`${GRID_COLUMNS} border-b border-zinc-200 dark:border-zinc-800`}>
        {/* Stays in the grid flow; only the label is visually hidden. */}
        <div role="columnheader">
          <span className="sr-only">Time</span>
        </div>
        {layout.days.map(({ date, minutes }) => {
          const isToday = date === today;
          const hours = minutes / 60;
          return (
            <div
              key={date}
              role="columnheader"
              aria-current={isToday ? "date" : undefined}
              className="flex flex-col items-center py-2 text-xs"
            >
              <span className="text-zinc-500">
                {formatDateKey(date, "EEE")}
                {/* Events use real elapsed time; the hour labels on the left assume 24 h. */}
                {hours !== 24 && (
                  <span
                    title={`Clocks change on this day: it has ${hours} hours`}
                    className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-900 dark:bg-amber-900 dark:text-amber-100"
                  >
                    {hours} h
                  </span>
                )}
              </span>
              <span
                className={`mt-0.5 flex size-8 items-center justify-center rounded-full text-base ${
                  isToday ? "bg-blue-600 font-semibold text-white" : ""
                }`}
              >
                {formatDateKey(date, "d")}
              </span>
            </div>
          );
        })}
      </div>

      {layout.stripLaneCount > 0 && (
        <div role="row" className={`${GRID_COLUMNS} border-b border-zinc-200 dark:border-zinc-800`}>
          <div role="rowheader" className="self-center pr-2 text-right text-[11px] text-zinc-500">
            All day
          </div>
          <div
            role="gridcell"
            className="col-span-7 grid grid-cols-7 gap-y-0.5 py-1"
            style={{ gridTemplateRows: `repeat(${layout.stripLaneCount}, 1.375rem)` }}
          >
            {layout.strip.map((bar) => (
              <Link
                key={bar.event.id}
                href={`/calendar/events/${bar.event.id}`}
                scroll={false}
                className={`mx-0.5 truncate rounded border px-1.5 text-xs leading-5 ${eventToneClass(bar.event, currentUserId)}`}
                style={{ gridColumn: `${bar.startIndex + 1} / ${bar.endIndex + 1}`, gridRow: bar.lane + 1 }}
                title={bar.event.title}
              >
                {bar.event.title}
              </Link>
            ))}
          </div>
        </div>
      )}

      <ScrollArea initialScrollTop={7 * HOUR_HEIGHT_PX} className="min-h-0 flex-1 overflow-y-auto">
        <div role="row" className={`relative ${GRID_COLUMNS}`}>
          <div aria-hidden className="relative">
            {HOURS.slice(1).map((hour) => (
              <span
                key={hour}
                className="absolute right-2 -translate-y-1/2 text-[11px] text-zinc-500"
                style={{ top: hour * HOUR_HEIGHT_PX }}
              >
                {String(hour).padStart(2, "0")}:00
              </span>
            ))}
          </div>

          {layout.days.map((day) => (
            <div
              key={day.date}
              role="gridcell"
              aria-label={formatDateKey(day.date, "EEEE, MMMM d")}
              className="relative border-l border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60"
              style={{ height: day.minutes * MINUTE_HEIGHT_PX }}
            >
              {day.workingBlocks.map((block) => (
                <div
                  key={block.startMinute}
                  aria-hidden
                  className="absolute inset-x-0 bg-white dark:bg-zinc-950"
                  style={{
                    top: block.startMinute * MINUTE_HEIGHT_PX,
                    height: (block.endMinute - block.startMinute) * MINUTE_HEIGHT_PX,
                  }}
                />
              ))}
              <div
                aria-hidden
                className="absolute inset-0 text-zinc-200 dark:text-zinc-800"
                style={{
                  backgroundImage: `repeating-linear-gradient(to bottom, currentColor 0 1px, transparent 1px ${HOUR_HEIGHT_PX}px)`,
                }}
              />
              {day.segments.map((segment) => (
                <TimedEventBlock
                  key={segment.event.id}
                  segment={segment}
                  days={layout.days}
                  timeZone={timeZone}
                  currentUserId={currentUserId}
                  overlay={overlay}
                  // One move at a time: a second drag would send a stale version.
                  canDrag={!isMoving && segment.event.attendees.some((a) => a.memberId === currentUserId)}
                  onMove={moveEvent}
                />
              ))}
              <NowLine dayStart={day.interval.start} dayEnd={day.interval.end} mockNow={mockNow} />
            </div>
          ))}

          <div
            ref={setOverlay}
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 left-[3.5rem]"
          />
        </div>
      </ScrollArea>

      {/* Screen readers hear the result of a drag. */}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
