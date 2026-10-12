"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteEventAction } from "@/features/events/actions";
import type { Interval } from "@/lib/intervals";
import { parseOccurrenceId } from "@/lib/recurrence/expand";
import { formatDateKey, formatInTimeZone, toZonedIso, type DateKey } from "@/lib/time/zoned";
import type { CalendarEvent } from "@/types/domain";
import { moveEventAction } from "../actions";
import { calendarHref, type CalendarShow, type CalendarView } from "../lib/params";
import { notifyCalendarChanged } from "../sync";
import { buildWeekLayout, type WeekDayLayout } from "../lib/week-layout";
import { CreateArea } from "./CreateArea";
import { eventToneClass } from "./event-style";
import { HOUR_HEIGHT_PX, MINUTE_HEIGHT_PX } from "./grid-constants";
import { NowLine } from "./NowLine";
import { ScrollArea } from "./ScrollArea";
import { TimedEventBlock, type MoveRequest } from "./TimedEventBlock";

type Props = {
  events: CalendarEvent[];
  /** 7 days for Week, 1 for Day. */
  days: DateKey[];
  view: Extract<CalendarView, "day" | "week">;
  show: CalendarShow;
  timeZone: string;
  today: DateKey;
  currentUserId: string;
  workingHours: Interval[];
  mockNow?: number;
};

const HOUR_MS = 60 * 60 * 1000;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

type OptimisticChange = { kind: "move"; id: string; start: number; end: number } | { kind: "delete"; id: string };

/**
 * Time grid for the Week and Day views. Client Component because of drag-n-drop,
 * resize, drag-to-create and keyboard control; events still arrive from the
 * server as props, and this component only layers optimistic changes on top.
 *
 * Optimistic flow: a moved/deleted event changes immediately.
 * - success: the action revalidates /calendar and fresh props replace the
 *   optimistic state in the same transition;
 * - failure: the props didn't change, so when the transition ends the event
 *   falls back by itself (rollback), and a toast explains why.
 */
export function WeekView({ events, days, view, show, timeZone, today, currentUserId, workingHours, mockNow }: Props) {
  const router = useRouter();
  const [optimisticEvents, applyChange] = useOptimistic(events, (current, change: OptimisticChange) =>
    change.kind === "delete"
      ? current.filter((event) => event.id !== change.id)
      : current.map((event) =>
          event.id === change.id
            ? { ...event, start: toZonedIso(change.start, event.timezone), end: toZonedIso(change.end, event.timezone) }
            : event,
        ),
  );
  const [isPending, startTransition] = useTransition();
  // Element over the day columns, for drag geometry and the drag preview.
  // State (not a ref) because it is read while rendering the blocks.
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // After a keyboard move the block may land in another column (a new DOM
  // node): put the focus back on it.
  const focusAfterRender = useRef<string | null>(null);

  const layout = buildWeekLayout({ events: optimisticEvents, days, timeZone, workingHours });
  const columns = { gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` };

  useEffect(() => {
    const id = focusAfterRender.current;
    if (!id) return;
    document.querySelector<HTMLElement>(`[data-event-id="${CSS.escape(id)}"]`)?.focus();
  });

  const reasonOf = (error: { message: string; fieldErrors?: Record<string, string[]> }) =>
    // Prefer the specific reason (e.g. "longer than 24 hours") over the generic message.
    Object.values(error.fieldErrors ?? {})[0]?.[0] ?? error.message;

  const moveEvent = ({ event, start, end, navigateTo, viaKeyboard }: MoveRequest) => {
    // Moving an occurrence of a series moves only that occurrence (scope "this").
    const what = parseOccurrenceId(event.id) ? `this occurrence of ${event.title}` : event.title;
    const description = `${what} to ${formatInTimeZone(start, timeZone, "EEEE HH:mm")}–${formatInTimeZone(end, timeZone, "HH:mm")}`;
    focusAfterRender.current = viaKeyboard ? event.id : null;
    startTransition(async () => {
      applyChange({ kind: "move", id: event.id, start, end });
      const result = await moveEventAction(event.id, event.version, start, end);
      if (result.ok) {
        notifyCalendarChanged();
        setAnnouncement(`Moved ${description}`);
        // Moved past the visible days: show where it went.
        if (navigateTo) router.push(calendarHref({ view, date: navigateTo, tz: timeZone, show }), { scroll: false });
      } else {
        const reason = reasonOf(result.error);
        toast.error(`Couldn't move "${event.title}": ${reason}`);
        setAnnouncement(`Couldn't move ${description}. ${reason}`);
      }
    });
  };

  const deleteEvent = (event: CalendarEvent) => {
    const isOccurrence = parseOccurrenceId(event.id) !== null;
    const question = isOccurrence ? `Delete this occurrence of "${event.title}"?` : `Delete "${event.title}"?`;
    if (!window.confirm(question)) return;
    focusAfterRender.current = null;
    startTransition(async () => {
      applyChange({ kind: "delete", id: event.id });
      const result = await deleteEventAction(event.id, event.version, isOccurrence ? "this" : undefined);
      if (result.ok) {
        notifyCalendarChanged();
        setAnnouncement(`Deleted ${event.title}`);
      } else {
        toast.error(`Couldn't delete "${event.title}": ${reasonOf(result.error)}`);
        setAnnouncement(`Couldn't delete ${event.title}`);
      }
    });
  };

  const createEvent = (start: number, end: number) => {
    const params = new URLSearchParams({ start: toZonedIso(start, timeZone), end: toZonedIso(end, timeZone), tz: timeZone });
    router.push(`/calendar/events/new?${params}`, { scroll: false });
  };

  return (
    <div
      role="grid"
      aria-label={
        view === "day"
          ? formatDateKey(days[0] ?? today, "EEEE, MMMM d, yyyy")
          : `Week of ${formatDateKey(days[0] ?? today, "MMMM d, yyyy")}`
      }
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-zinc-200 print:overflow-visible dark:border-zinc-800"
    >
      <div role="row" className="grid border-b border-zinc-200 dark:border-zinc-800" style={columns}>
        {/* Stays in the grid flow; only the label is visually hidden. */}
        <div role="columnheader">
          <span className="sr-only">Time</span>
        </div>
        {layout.days.map(({ date, minutes }) => {
          const isToday = date === today;
          const hours = minutes / 60;
          return (
            <div key={date} role="columnheader" aria-current={isToday ? "date" : undefined} className="flex flex-col items-center py-2 text-xs">
              <span className="text-zinc-500">
                {formatDateKey(date, view === "day" ? "EEEE" : "EEE")}
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
        <div role="row" className="grid border-b border-zinc-200 dark:border-zinc-800" style={columns}>
          <div role="rowheader" className="self-center pr-2 text-right text-[11px] text-zinc-500">
            All day
          </div>
          <div
            role="gridcell"
            className="grid gap-y-0.5 py-1"
            style={{
              gridColumn: `2 / span ${days.length}`,
              gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${layout.stripLaneCount}, 1.375rem)`,
            }}
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

      <ScrollArea initialScrollTop={7 * HOUR_HEIGHT_PX} className="min-h-0 flex-1 overflow-y-auto print:overflow-visible">
        <div role="row" className="relative grid" style={columns}>
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
              {/* Hour lines every real hour since local midnight (23 or 25 on DST days). */}
              <div
                aria-hidden
                className="absolute inset-0 text-zinc-200 dark:text-zinc-800"
                style={{
                  backgroundImage: `repeating-linear-gradient(to bottom, currentColor 0 1px, transparent 1px ${HOUR_HEIGHT_PX}px)`,
                }}
              />
              {day.minutes !== 24 * 60 && <DstHourLabels day={day} timeZone={timeZone} />}
              <CreateArea day={day} timeZone={timeZone} onCreate={createEvent} />
              {day.segments.map((segment) => (
                <TimedEventBlock
                  key={segment.event.id}
                  segment={segment}
                  days={layout.days}
                  timeZone={timeZone}
                  currentUserId={currentUserId}
                  overlay={overlay}
                  // One change at a time: a second one would send a stale version.
                  canDrag={!isPending && segment.event.attendees.some((a) => a.memberId === currentUserId)}
                  onMove={moveEvent}
                  onDelete={deleteEvent}
                />
              ))}
              <NowLine dayStart={day.interval.start} dayEnd={day.interval.end} mockNow={mockNow} />
            </div>
          ))}

          <div ref={setOverlay} aria-hidden className="pointer-events-none absolute inset-y-0 right-0 left-[3.5rem]" />
        </div>
      </ScrollArea>

      {/* Screen readers hear the result of a drag, resize or keyboard move. */}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}

/**
 * On a 23/25-hour day the shared hour labels on the left no longer match,
 * so the column labels its own hours from the real local hour starts:
 * the fall-back night shows 03:00 twice, the spring-forward one skips it.
 */
function DstHourLabels({ day, timeZone }: { day: WeekDayLayout; timeZone: string }) {
  const marks: { top: number; label: string }[] = [];
  for (let instant = day.interval.start + HOUR_MS; instant < day.interval.end; instant += HOUR_MS) {
    marks.push({
      top: ((instant - day.interval.start) / HOUR_MS) * HOUR_HEIGHT_PX,
      label: formatInTimeZone(instant, timeZone, "HH:mm"),
    });
  }
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[6]">
      {marks.map((mark) => (
        <span
          key={mark.top}
          className="absolute left-0.5 -translate-y-1/2 rounded bg-amber-50 px-0.5 text-[9px] text-amber-800 dark:bg-amber-950 dark:text-amber-200"
          style={{ top: mark.top }}
        >
          {mark.label}
        </span>
      ))}
    </div>
  );
}
