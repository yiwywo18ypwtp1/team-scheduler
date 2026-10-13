"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatDateKey, type DateKey } from "@/lib/time/zoned";
import type { CalendarEvent } from "@/types/domain";
import { monthDayEvents } from "../lib/month-layout";
import { calendarHref, type CalendarShow } from "../lib/params";
import { EventLabel } from "./EventLabel";
import { eventToneClass } from "./event-style";

type Props = {
  day: DateKey;
  count: number;
  timeZone: string;
  show: CalendarShow;
  currentUserId: string;
};

type State = { status: "idle" | "loading" | "failed" } | { status: "loaded"; events: CalendarEvent[] };

/**
 * "+N more" in a month cell. The native popover opens at once; the day's
 * events are fetched when it opens, so the month page doesn't carry every
 * day's full list in its HTML (a team month has ~3000 occurrences).
 */
export function MoreEventsPopover({ day, count, timeZone, show, currentUserId }: Props) {
  const popoverId = `more-${day}`;
  const [state, setState] = useState<State>({ status: "idle" });
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  // Loaded data is dropped on close: the calendar may have changed meanwhile.
  const onToggle = (event: React.ToggleEvent<HTMLDivElement>) => {
    controllerRef.current?.abort();
    if (event.newState !== "open") {
      setState({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: "loading" });
    const params = new URLSearchParams({ from: day, to: day, tz: timeZone });
    if (show === "mine") params.append("members[]", currentUserId);
    fetch(`/api/events?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const { events } = (await response.json()) as { events: CalendarEvent[] };
        setState({ status: "loaded", events: monthDayEvents(events, day, timeZone) });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "failed" });
      });
  };

  return (
    <>
      <button
        type="button"
        popoverTarget={popoverId}
        className="rounded px-1 text-xs font-medium text-zinc-600 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-700"
      >
        +{count} more
      </button>
      <div
        id={popoverId}
        popover="auto"
        onToggle={onToggle}
        aria-busy={state.status === "loading"}
        className="w-72 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
      >
        <p className="mb-2 text-sm font-semibold">{formatDateKey(day, "EEEE, MMMM d")}</p>
        {state.status === "loaded" ? (
          <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {state.events.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/calendar/events/${event.id}`}
                  scroll={false}
                  className={`block truncate rounded border px-1.5 text-xs leading-5 ${eventToneClass(event, currentUserId)}`}
                >
                  <EventLabel event={event} timeZone={timeZone} />
                </Link>
              </li>
            ))}
          </ul>
        ) : state.status === "failed" ? (
          <p role="alert" className="text-xs text-red-700 dark:text-red-400">
            Couldn&apos;t load events.{" "}
            <Link href={calendarHref({ view: "day", date: day, tz: timeZone, show })} className="underline">
              Open the day
            </Link>
          </p>
        ) : (
          <p className="text-xs text-zinc-500">Loading…</p>
        )}
      </div>
    </>
  );
}
