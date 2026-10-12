"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { addDaysToDateKey, formatDateKey, formatInTimeZone, isValidDateKey, type DateKey } from "@/lib/time/zoned";
import type { CalendarEvent } from "@/types/domain";
import { buildAgendaRows } from "../lib/agenda";
import { isStripEvent } from "../lib/event-days";
import type { CalendarShow } from "../lib/params";
import { eventToneClass } from "./event-style";

const CHUNK_DAYS = 21;
/** Load more when this close (in rows) to either end. */
const LOAD_THRESHOLD = 5;

type Props = {
  /** First window, rendered on the server. */
  initialEvents: CalendarEvent[];
  from: DateKey;
  to: DateKey;
  /** The date the agenda opens at (scrolled into view). */
  anchor: DateKey;
  today: DateKey;
  timeZone: string;
  show: CalendarShow;
  currentUserId: string;
};

type Loaded = { from: DateKey; to: DateKey; events: CalendarEvent[] };
type Direction = "before" | "after";

function daysBetween(from: DateKey, to: DateKey): DateKey[] {
  const days: DateKey[] = [];
  for (let day = from; day <= to; day = addDaysToDateKey(day, 1)) days.push(day);
  return days;
}

/**
 * Endless agenda in both directions, virtualized: only the rows in view (plus
 * a few) are in the DOM, however many weeks have been loaded.
 *
 * The first window comes from the server; scrolling near either end fetches
 * the next 3 weeks from GET /api/events. Each direction has its own request,
 * aborted on unmount; a direction loads one chunk at a time. Loading earlier
 * rows shifts the scroll position by the inserted rows, so the view doesn't jump.
 */
export function AgendaView({ initialEvents, from, to, anchor, today, timeZone, show, currentUserId }: Props) {
  const [loaded, setLoaded] = useState<Loaded>({ from, to, events: initialEvents });
  const [loading, setLoading] = useState<Record<Direction, boolean>>({ before: false, after: false });
  const [failed, setFailed] = useState<Direction | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const controllers = useRef<Partial<Record<Direction, AbortController>>>({});
  // The first visible row before a "before" load; afterwards it is scrolled
  // back to the top, so inserting rows above doesn't make the view jump.
  const keepInViewKey = useRef<string | null>(null);

  const rows = buildAgendaRows(loaded.events, daysBetween(loaded.from, loaded.to), timeZone, [today, anchor]);

  // The project doesn't use the React Compiler; the virtualizer is fine without memoization.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (rows[index]?.kind === "day" ? 40 : 44),
    overscan: 10,
    getItemKey: (index) => rows[index]?.key ?? index,
  });

  // Open at the anchor date.
  useLayoutEffect(() => {
    const index = rows.findIndex((row) => row.kind === "day" && row.date === anchor);
    if (index > 0) virtualizer.scrollToIndex(index, { align: "start" });
    // Only on mount: later loads keep the user's position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const key = keepInViewKey.current;
    if (!key) return;
    const index = rows.findIndex((row) => row.key === key);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "start" });
    keepInViewKey.current = null;
  }, [rows, virtualizer]);

  useEffect(() => {
    const current = controllers.current;
    return () => Object.values(current).forEach((controller) => controller?.abort());
  }, []);

  const load = (direction: Direction) => {
    if (loading[direction]) return;
    const rangeFrom = direction === "before" ? addDaysToDateKey(loaded.from, -CHUNK_DAYS) : addDaysToDateKey(loaded.to, 1);
    const rangeTo = direction === "before" ? addDaysToDateKey(loaded.from, -1) : addDaysToDateKey(loaded.to, CHUNK_DAYS);
    if (!isValidDateKey(rangeFrom) || !isValidDateKey(rangeTo)) return; // outside the supported years

    const controller = new AbortController();
    controllers.current[direction] = controller;
    setLoading((state) => ({ ...state, [direction]: true }));
    setFailed(null);

    const params = new URLSearchParams({ from: rangeFrom, to: rangeTo, tz: timeZone });
    if (show === "mine") params.append("members[]", currentUserId);
    fetch(`/api/events?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const { events } = (await response.json()) as { events: CalendarEvent[] };
        if (direction === "before") keepInViewKey.current = rows[virtualizer.getVirtualItems()[0]?.index ?? 0]?.key ?? null;
        setLoaded((state) => {
          const known = new Set(state.events.map((event) => event.id));
          const fresh = events.filter((event) => !known.has(event.id));
          return direction === "before"
            ? { from: rangeFrom, to: state.to, events: [...fresh, ...state.events] }
            : { from: state.from, to: rangeTo, events: [...state.events, ...fresh] };
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(direction);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading((state) => ({ ...state, [direction]: false }));
      });
  };

  // Near either end: load the next chunk.
  const items = virtualizer.getVirtualItems();
  const firstIndex = items[0]?.index ?? 0;
  const lastIndex = items.at(-1)?.index ?? 0;
  useEffect(() => {
    if (rows.length === 0 || failed) return;
    if (firstIndex < LOAD_THRESHOLD) load("before");
    if (lastIndex > rows.length - LOAD_THRESHOLD) load("after");
    // `load` reads the latest state; re-run only when the visible range changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstIndex, lastIndex, rows.length, failed]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
      <p aria-live="polite" className="sr-only">
        {loading.before ? "Loading earlier events" : loading.after ? "Loading later events" : ""}
      </p>
      {failed && (
        <p role="alert" className="flex items-center gap-2 border-b border-zinc-200 px-4 py-2 text-sm dark:border-zinc-800">
          Couldn&apos;t load {failed === "before" ? "earlier" : "later"} events.
          <button type="button" onClick={() => setFailed(null)} className="underline">
            Try again
          </button>
        </p>
      )}
      <div ref={scrollRef} data-scroll-container className="min-h-0 flex-1 overflow-y-auto" aria-label="Agenda" role="feed" aria-busy={loading.before || loading.after}>
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {items.map((item) => {
            const row = rows[item.index];
            if (!row) return null;
            return (
              <div
                key={item.key}
                data-index={item.index}
                ref={virtualizer.measureElement}
                className="absolute inset-x-0 top-0"
                style={{ transform: `translateY(${item.start}px)` }}
              >
                {row.kind === "day" && (
                  <h3
                    className={`border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-semibold dark:border-zinc-800 dark:bg-zinc-900 ${
                      row.date === today ? "text-blue-700 dark:text-blue-400" : ""
                    }`}
                  >
                    {formatDateKey(row.date, "EEEE, MMMM d, yyyy")}
                    {row.date === today && " · Today"}
                  </h3>
                )}
                {row.kind === "empty" && <p className="px-4 py-2 text-sm text-zinc-500">No events</p>}
                {row.kind === "event" && (
                  <Link
                    href={`/calendar/events/${row.event.id}`}
                    scroll={false}
                    className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  >
                    <span className="w-28 shrink-0 text-zinc-500">
                      {isStripEvent(row.event)
                        ? "All day"
                        : `${formatInTimeZone(Date.parse(row.event.start), timeZone, "HH:mm")}–${formatInTimeZone(Date.parse(row.event.end), timeZone, "HH:mm")}`}
                    </span>
                    <span className={`truncate rounded border px-2 py-0.5 ${eventToneClass(row.event, currentUserId)}`}>
                      {row.event.seriesId && <span aria-hidden>↻ </span>}
                      {row.event.title}
                    </span>
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
