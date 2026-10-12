import Link from "next/link";
import type { ReactNode } from "react";
import { toApiError } from "@/lib/errors";
import { intersectIntervals, type Interval } from "@/lib/intervals";
import { addDaysToDateKey, dayIntervalInTimeZone, formatDateKey, formatInTimeZone, toZonedIso } from "@/lib/time/zoned";
import { getAvailability } from "@/server/availability";
import { simulateNetwork } from "@/server/mock-network";
import { findTimeSearchParams, type FindTimeQuery } from "../schema";

const MINUTE_MS = 60 * 1000;

/**
 * Async Server Component, rendered inside <Suspense> so the form stays
 * usable while the (deliberately slow) computation runs. Expected errors are
 * shown here, so a failure doesn't replace the page with error.tsx.
 */
export async function AvailabilityResults({ query }: { query: FindTimeQuery }) {
  let result;
  try {
    // Same artificial latency as POST /api/availability (300-1200 ms).
    await simulateNetwork({ min: 300, max: 1200 });
    result = getAvailability(query);
  } catch (error) {
    const { error: apiError } = toApiError(error);
    const details = Object.values(apiError.fieldErrors ?? {}).flat();
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
        <p className="font-medium">{apiError.message}</p>
        {details.length > 0 && (
          <ul className="mt-1 list-disc pl-5">
            {details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        )}
        <Link href={`/find-time?${findTimeSearchParams(query)}`} className="mt-2 inline-block underline">
          Try again
        </Link>
      </div>
    );
  }

  const { tz } = query;
  const durationMs = query.duration * MINUTE_MS;
  const days: string[] = [];
  for (let day = query.from; day <= query.to; day = addDaysToDateKey(day, 1)) days.push(day);

  const newEventHref = (start: number) => {
    const params = new URLSearchParams({
      start: toZonedIso(start, tz),
      end: toZonedIso(start + durationMs, tz),
      tz,
      attendees: query.memberIds.join(","),
    });
    if (query.roomId) params.set("room", query.roomId);
    return `/calendar/events/new?${params}`;
  };

  return (
    <section aria-labelledby="results-title" className="flex flex-col gap-6">
      <div>
        <h2 id="results-title" className="text-lg font-semibold">
          {result.windows.length === 0
            ? "No common free time in this range"
            : `${result.windows.length} common ${result.windows.length === 1 ? "window" : "windows"}`}
        </h2>
        <p className="text-sm text-zinc-500">
          Times in {tz}. Dark grey: busy, white: working hours, light grey: outside working hours, green: everyone is free
          {result.room ? ` and ${result.room.room.name} is available` : ""}.
        </p>
      </div>

      {result.windows.length > 0 && (
        <ul aria-label="Free windows" className="flex flex-wrap gap-2">
          {result.windows.map((window) => (
            <li key={window.start}>
              <Link
                href={newEventHref(window.start)}
                className="block rounded-md border border-green-300 bg-green-50 px-3 py-1.5 text-sm hover:bg-green-100 dark:border-green-800 dark:bg-green-950 dark:hover:bg-green-900"
              >
                {formatInTimeZone(window.start, tz, "EEE, MMM d HH:mm")}–{formatInTimeZone(window.end, tz, "HH:mm")}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {days.map((date) => {
        const day = dayIntervalInTimeZone(date, tz);
        return (
          <div key={date} className="flex flex-col gap-1">
            <h3 className="text-sm font-medium">{formatDateKey(date, "EEEE, MMMM d")}</h3>
            <HourScale />
            {result.members.map(({ member, working, busy }) => (
              <TimelineRow key={member.id} label={member.name} hint={member.timezone}>
                <Blocks day={day} intervals={working} className="bg-white dark:bg-zinc-950" />
                <Blocks day={day} intervals={busy} className="bg-zinc-500 dark:bg-zinc-500" title="Busy" tz={tz} />
              </TimelineRow>
            ))}
            {result.room && (
              <TimelineRow label={result.room.room.name} hint="room">
                <Blocks day={day} intervals={[day]} className="bg-white dark:bg-zinc-950" />
                <Blocks day={day} intervals={result.room.busy} className="bg-zinc-500 dark:bg-zinc-500" title="Booked" tz={tz} />
              </TimelineRow>
            )}
            <TimelineRow label="Everyone" hint="free">
              {intersectIntervals(result.windows, [day]).map((window) => (
                <Link
                  key={window.start}
                  href={newEventHref(window.start)}
                  aria-label={`Book ${formatInTimeZone(window.start, tz, "EEE HH:mm")}`}
                  className="absolute inset-y-0 rounded-sm bg-green-400 hover:bg-green-500 dark:bg-green-600"
                  style={position(window, day)}
                  title={`${formatInTimeZone(window.start, tz, "HH:mm")}–${formatInTimeZone(window.end, tz, "HH:mm")}`}
                />
              ))}
            </TimelineRow>
          </div>
        );
      })}
    </section>
  );
}

/** Horizontal position of an interval inside a day, in %. Uses the real day length (DST-safe). */
function position(interval: Interval, day: Interval) {
  const length = day.end - day.start;
  const start = Math.max(interval.start, day.start);
  const end = Math.min(interval.end, day.end);
  return {
    left: `${((start - day.start) / length) * 100}%`,
    width: `${((end - start) / length) * 100}%`,
  };
}

function TimelineRow({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[12rem_1fr] items-center gap-3">
      <div className="truncate text-xs">
        <span className="font-medium">{label}</span> <span className="text-zinc-500">· {hint}</span>
      </div>
      <div className="relative h-5 overflow-hidden rounded-sm bg-zinc-200 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">{children}</div>
    </div>
  );
}

function Blocks({
  day,
  intervals,
  className,
  title,
  tz,
}: {
  day: Interval;
  intervals: Interval[];
  className: string;
  title?: string;
  tz?: string;
}) {
  return intersectIntervals(intervals, [day]).map((interval) => (
    <div
      key={interval.start}
      aria-hidden
      className={`absolute inset-y-0 ${className}`}
      style={position(interval, day)}
      title={
        title && tz
          ? `${title} ${formatInTimeZone(interval.start, tz, "HH:mm")}–${formatInTimeZone(interval.end, tz, "HH:mm")}`
          : undefined
      }
    />
  ));
}

function HourScale() {
  return (
    <div aria-hidden className="grid grid-cols-[12rem_1fr] gap-3">
      <span />
      <div className="relative h-4 text-[10px] text-zinc-500">
        {[0, 6, 12, 18].map((hour) => (
          <span key={hour} className="absolute" style={{ left: `${(hour / 24) * 100}%` }}>
            {String(hour).padStart(2, "0")}:00
          </span>
        ))}
      </div>
    </div>
  );
}
