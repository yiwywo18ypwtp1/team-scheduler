"use client";

import { useEffect, useState } from "react";
import { useWatch, type Control, type UseFormSetValue } from "react-hook-form";
import type { Conflict } from "@/lib/availability";
import { addDaysToDateKey, formatInTimeZone } from "@/lib/time/zoned";
import type { ConflictsQuery } from "../conflicts-schema";
import { toWallFields } from "../form-values";
import { formValuesToInterval, type EventFormValues } from "../schema";

type NamedConflict = Conflict & { name: string };
type CheckResult = { key: string; conflicts?: NamedConflict[]; error?: string };

const DEBOUNCE_MS = 400;
const MINUTE_MS = 60 * 1000;
const SEARCH_DAYS = 14;
const MAX_SEARCH_DURATION_MIN = 480;

type Props = {
  control: Control<EventFormValues>;
  setValue: UseFormSetValue<EventFormValues>;
  /** The event being edited, so it doesn't conflict with itself. */
  ignoreEventId?: string;
};

/**
 * Async warnings (not errors): who is already busy, and whether the room is
 * booked, for the times in the form. The user can still save.
 *
 * - Debounced: checks 400 ms after the last change, not on every keystroke.
 * - Races: the pending request is aborted when the inputs change, and every
 *   result is tagged with the query it answers, so a late response for old
 *   inputs is never shown.
 */
export function ConflictWarnings({ control, setValue, ignoreEventId }: Props) {
  const [startDate, startTime, endDate, endTime, timezone, allDay, attendeeIds, location] = useWatch({
    control,
    name: ["startDate", "startTime", "endDate", "endTime", "timezone", "allDay", "attendeeIds", "location"],
  });
  const [result, setResult] = useState<CheckResult | null>(null);
  const [search, setSearch] = useState<"idle" | "searching" | "none">("idle");

  // The query is a plain string key: equal inputs -> no new request.
  let interval: { start: number; end: number } | null = null;
  try {
    interval = formValuesToInterval({ allDay, startDate, startTime, endDate, endTime, timezone });
  } catch {
    // Incomplete date/time: nothing to check yet; the field errors say why.
  }
  const roomId = location.kind === "room" && location.roomId ? location.roomId : undefined;
  const query: ConflictsQuery | null =
    interval && interval.end > interval.start && (attendeeIds.length > 0 || roomId)
      ? {
          start: new Date(interval.start).toISOString(),
          end: new Date(interval.end).toISOString(),
          attendeeIds,
          roomId,
          ignoreEventId,
        }
      : null;
  const key = query ? JSON.stringify(query) : null;

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch("/api/conflicts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: key,
        signal: controller.signal,
      })
        .then(async (response) => {
          const body = await response.json();
          setResult(
            response.ok
              ? { key, conflicts: body.conflicts as NamedConflict[] }
              : { key, error: body?.error?.message ?? "Couldn't check availability" },
          );
        })
        .catch(() => {
          if (!controller.signal.aborted) setResult({ key, error: "Couldn't check availability" });
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key]);

  if (!key || !interval) return null;
  const current = result?.key === key ? result : null;
  const durationMinutes = Math.ceil((interval.end - interval.start) / MINUTE_MS / 15) * 15;
  const canSearch = !allDay && durationMinutes <= MAX_SEARCH_DURATION_MIN && attendeeIds.length > 0;

  const findNearestFree = async () => {
    if (!interval) return;
    setSearch("searching");
    try {
      const response = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberIds: attendeeIds,
          roomId,
          from: startDate,
          to: addDaysToDateKey(startDate, SEARCH_DAYS - 1),
          duration: durationMinutes,
          tz: timezone,
        }),
      });
      const body = await response.json();
      const windows: { start: string }[] = response.ok ? body.windows : [];
      const starts = windows.map((window) => Date.parse(window.start));
      // Prefer the first free time at or after the planned start.
      const next = starts.find((start) => start >= interval!.start) ?? starts[0];
      if (next === undefined) return setSearch("none");

      const fields = toWallFields(next, next + durationMinutes * MINUTE_MS, timezone);
      for (const [name, value] of Object.entries(fields)) {
        setValue(name as keyof typeof fields, value, { shouldDirty: true, shouldValidate: true });
      }
      setSearch("idle");
    } catch {
      setSearch("none");
    }
  };

  const time = (iso: string) => formatInTimeZone(Date.parse(iso), timezone, "EEE HH:mm");

  return (
    <div aria-live="polite" className="text-sm">
      {!current && <p className="text-xs text-zinc-500">Checking availability…</p>}
      {current?.error && <p className="text-xs text-zinc-500">{current.error}</p>}
      {current?.conflicts?.length === 0 && <p className="text-xs text-green-700 dark:text-green-400">Everyone is free</p>}
      {current?.conflicts && current.conflicts.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
          <p className="font-medium">Heads up: overlaps with other events (you can still save)</p>
          <ul className="mt-1 list-disc pl-5">
            {current.conflicts.map((conflict) => (
              <li key={`${conflict.kind}:${conflict.kind === "member" ? conflict.memberId : conflict.roomId}`}>
                {conflict.kind === "room" ? `Room ${conflict.name} is booked` : `${conflict.name} is busy`}:{" "}
                {conflict.events
                  .map((event) =>
                    // All-day events are dates, not times in this timezone.
                    event.allDay ? `${event.title} (all day)` : `${event.title} (${time(event.start)}–${time(event.end).slice(4)})`,
                  )
                  .join(", ")}
              </li>
            ))}
          </ul>
          {canSearch && (
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={findNearestFree}
                disabled={search === "searching"}
                className="rounded-md border border-amber-400 bg-white px-3 py-1 text-sm font-medium disabled:opacity-60 dark:bg-zinc-900"
              >
                {search === "searching" ? "Searching…" : "Find nearest free time"}
              </button>
              {search === "none" && (
                <span className="text-xs">No common free time in the next {SEARCH_DAYS} days.</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
