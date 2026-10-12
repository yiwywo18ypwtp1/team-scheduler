import Link from "next/link";
import type { DateKey } from "@/lib/time/zoned";
import { CALENDAR_VIEWS, calendarHref, type CalendarParams } from "../lib/params";
import { shiftDate } from "../lib/range";
import { TimeZoneSelect } from "./TimeZoneSelect";

type Props = { params: CalendarParams; today: DateKey; title: string };

const buttonClass =
  "rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";

/**
 * Server Component: navigation is plain links built from URL state.
 * `prefetch` on prev/next loads the neighbouring period's full RSC payload
 * (including its events) ahead of time, so switching weeks feels instant.
 */
export function CalendarToolbar({ params, today, title }: Props) {
  const periodName = params.view === "week" ? "week" : "month";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <nav aria-label="Calendar navigation" className="flex items-center gap-2">
        <Link href={calendarHref({ ...params, date: today })} className={buttonClass}>
          Today
        </Link>
        <Link
          href={calendarHref({ ...params, date: shiftDate(params.view, params.date, -1) })}
          prefetch
          aria-label={`Previous ${periodName}`}
          className={buttonClass}
        >
          ‹
        </Link>
        <Link
          href={calendarHref({ ...params, date: shiftDate(params.view, params.date, 1) })}
          prefetch
          aria-label={`Next ${periodName}`}
          className={buttonClass}
        >
          ›
        </Link>
      </nav>

      <h1 className="text-lg font-semibold">{title}</h1>

      <div className="ml-auto flex items-center gap-3">
        <nav aria-label="View" className="flex overflow-hidden rounded-md border border-zinc-300 dark:border-zinc-700">
          {CALENDAR_VIEWS.map((view) => (
            <Link
              key={view}
              href={calendarHref({ ...params, view })}
              aria-current={view === params.view ? "page" : undefined}
              className="px-3 py-1 text-sm capitalize hover:bg-zinc-100 aria-[current=page]:bg-zinc-900 aria-[current=page]:text-white dark:hover:bg-zinc-800 dark:aria-[current=page]:bg-zinc-100 dark:aria-[current=page]:text-zinc-900"
            >
              {view}
            </Link>
          ))}
        </nav>
        <TimeZoneSelect params={params} />
        <Link
          href="/calendar/events/new"
          scroll={false}
          className="rounded-md bg-zinc-900 px-3 py-1 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          New event
        </Link>
      </div>
    </div>
  );
}
