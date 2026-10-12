"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { TIME_ZONE_OPTIONS } from "@/lib/time/time-zones";
import { calendarHref, type CalendarParams } from "../lib/params";

/**
 * Display-timezone switcher. The only interactive part of the toolbar:
 * it writes the choice into the URL, which stays the source of truth.
 */
export function TimeZoneSelect({ params }: { params: CalendarParams }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // A valid timezone from the URL may be missing from the short picker list.
  const options = (TIME_ZONE_OPTIONS as readonly string[]).includes(params.tz)
    ? TIME_ZONE_OPTIONS
    : [params.tz, ...TIME_ZONE_OPTIONS];

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-zinc-500">Timezone</span>
      <select
        value={params.tz}
        disabled={isPending}
        onChange={(event) => {
          const tz = event.target.value;
          startTransition(() => router.push(calendarHref({ ...params, tz })));
        }}
        className="rounded-md border border-zinc-300 bg-white px-2 py-1 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
      >
        {options.map((timeZone) => (
          <option key={timeZone} value={timeZone}>
            {timeZone}
          </option>
        ))}
      </select>
    </label>
  );
}
