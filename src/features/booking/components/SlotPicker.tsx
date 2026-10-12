"use client";

import { useEffect, useState } from "react";
import { addDaysToDateKey, formatDateKey, formatInTimeZone } from "@/lib/time/zoned";
import { groupSlotsByDay } from "../lib/slots";
import type { SlotsResponse } from "../schema";

type Props = {
  slug: string;
  timeZone: string;
  duration: number;
  /** Selected slot start (ISO) or "". */
  selected: string;
  onSelect: (start: string) => void;
  /** Changing it reloads the slots, e.g. after someone else took the chosen slot. */
  refreshKey: number;
};

type LoadResult = { key: string; data?: SlotsResponse; error?: string };

/**
 * Week of days and the free slots of the selected day, in the guest's timezone.
 *
 * Slots are fetched on the client because they depend on the current time and
 * on bookings made a moment ago, while the page itself is static. One plain
 * fetch in an effect; no data library for a single request.
 *
 * Races: switching week/timezone/duration quickly aborts the previous request
 * in the effect cleanup, and every result is tagged with the key it was
 * requested for, so a late response can never show slots for old inputs.
 */
export function SlotPicker({ slug, timeZone, duration, selected, onSelect, refreshKey }: Props) {
  // undefined = let the server pick "today" (it knows MOCK_NOW, the browser doesn't).
  const [from, setFrom] = useState<string | undefined>(undefined);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);
  const [chosenDay, setChosenDay] = useState<string | null>(null);

  const requestKey = [timeZone, duration, from ?? "", refreshKey, retry].join("|");

  useEffect(() => {
    const key = [timeZone, duration, from ?? "", refreshKey, retry].join("|");
    const controller = new AbortController();
    const params = new URLSearchParams({ tz: timeZone, duration: String(duration) });
    if (from) params.set("from", from);

    fetch(`/api/book/${encodeURIComponent(slug)}/slots?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        setResult(
          response.ok
            ? { key, data: body as SlotsResponse }
            : { key, error: body?.error?.message ?? "Couldn't load available times" },
        );
      })
      .catch(() => {
        if (controller.signal.aborted) return; // superseded by a newer request
        setResult({ key, error: "Network error. Check your connection and try again." });
      });

    return () => controller.abort();
  }, [slug, timeZone, duration, from, refreshKey, retry]);

  const isLoading = result?.key !== requestKey;
  const data = result?.data;

  if (result?.error && !isLoading) {
    return (
      <div role="alert" className="flex items-center gap-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
        {result.error}
        <button type="button" onClick={() => setRetry((count) => count + 1)} className="underline">
          Try again
        </button>
      </div>
    );
  }
  if (!data) return <p className="text-sm text-zinc-500">Loading available times…</p>;

  const byDay = groupSlotsByDay(
    data.slots.map((slot) => ({ start: Date.parse(slot.start), end: Date.parse(slot.end) })),
    timeZone,
  );
  const days: string[] = [];
  for (let day = data.from; day <= data.to; day = addDaysToDateKey(day, 1)) days.push(day);

  // Keep the guest's chosen day if it has slots, otherwise the first day that does.
  const activeDay = chosenDay && byDay.has(chosenDay) ? chosenDay : days.find((day) => byDay.has(day));
  const daySlots = activeDay ? (byDay.get(activeDay) ?? []) : [];

  return (
    <div className={`flex flex-col gap-4 ${isLoading ? "opacity-60" : ""}`} aria-busy={isLoading}>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setFrom(addDaysToDateKey(data.from, -7))}
          disabled={isLoading || data.from <= data.firstDate}
          className="rounded-md border border-zinc-300 px-3 py-1 text-sm disabled:opacity-40 dark:border-zinc-700"
        >
          ‹ Earlier
        </button>
        <span className="text-sm font-medium">
          {formatDateKey(data.from, "MMM d")} – {formatDateKey(data.to, "MMM d, yyyy")}
        </span>
        <button
          type="button"
          onClick={() => setFrom(addDaysToDateKey(data.from, 7))}
          disabled={isLoading || addDaysToDateKey(data.from, 7) > data.lastDate}
          className="rounded-md border border-zinc-300 px-3 py-1 text-sm disabled:opacity-40 dark:border-zinc-700"
        >
          Later ›
        </button>
      </div>

      <div role="group" aria-label="Days" className="grid grid-cols-7 gap-1.5">
        {days.map((day) => {
          const count = byDay.get(day)?.length ?? 0;
          return (
            <button
              key={day}
              type="button"
              onClick={() => setChosenDay(day)}
              disabled={count === 0}
              aria-pressed={day === activeDay}
              aria-label={`${formatDateKey(day, "EEEE, MMMM d")}: ${count} free ${count === 1 ? "time" : "times"}`}
              className="flex flex-col items-center rounded-md border border-zinc-200 py-2 text-xs disabled:opacity-40 aria-pressed:border-zinc-900 aria-pressed:bg-zinc-900 aria-pressed:text-white dark:border-zinc-700 dark:aria-pressed:bg-zinc-100 dark:aria-pressed:text-zinc-900"
            >
              <span>{formatDateKey(day, "EEE")}</span>
              <span className="text-base font-semibold">{formatDateKey(day, "d")}</span>
            </button>
          );
        })}
      </div>

      {daySlots.length === 0 ? (
        <p className="text-sm text-zinc-500">No free times this week. Try later dates.</p>
      ) : (
        <div role="group" aria-label="Times" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {daySlots.map((slot) => {
            const iso = new Date(slot.start).toISOString();
            return (
              <button
                key={slot.start}
                type="button"
                onClick={() => onSelect(iso)}
                aria-pressed={iso === selected}
                className="rounded-md border border-blue-300 py-2 text-sm text-blue-800 hover:bg-blue-50 aria-pressed:bg-blue-600 aria-pressed:text-white dark:border-blue-800 dark:text-blue-200 dark:hover:bg-blue-950"
              >
                {formatInTimeZone(slot.start, timeZone, "HH:mm")}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
