import Link from "next/link";
import type { DateKey } from "@/lib/time/zoned";
import { CALENDAR_SHOWS, CALENDAR_VIEWS, calendarHref, type CalendarParams } from "../lib/params";
import { shiftDate } from "../lib/range";
import { ImportIcsButton } from "./ImportIcsButton";
import { PrintButton } from "./PrintButton";
import { TimeZoneSelect } from "./TimeZoneSelect";

type Props = { params: CalendarParams; today: DateKey; title: string; userId: string };

const segmentClass =
  "px-3 py-1 text-sm hover:bg-zinc-100 aria-[current=page]:bg-zinc-900 aria-[current=page]:text-white dark:hover:bg-zinc-800 dark:aria-[current=page]:bg-zinc-100 dark:aria-[current=page]:text-zinc-900";

const buttonClass =
  "rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";

/**
 * Server Component: navigation is plain links built from URL state.
 * `prefetch` on prev/next loads the neighbouring period's full RSC payload
 * (including its events) ahead of time, so switching weeks feels instant.
 */
export function CalendarToolbar({ params, today, title, userId }: Props) {
  const periodName = { day: "day", week: "week", month: "month", agenda: "week" }[params.view];

  return (
    <div className="flex flex-wrap items-center gap-3">
      <nav aria-label="Calendar navigation" className="flex items-center gap-2 print:hidden">
        <Link href={calendarHref({ ...params, date: today })} aria-keyshortcuts="T" className={buttonClass}>
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

      <div className="ml-auto flex items-center gap-3 print:hidden">
        <nav aria-label="View" className="flex overflow-hidden rounded-md border border-zinc-300 dark:border-zinc-700">
          {CALENDAR_VIEWS.map((view) => (
            <Link
              key={view}
              href={calendarHref({ ...params, view })}
              aria-current={view === params.view ? "page" : undefined}
              className={`${segmentClass} capitalize`}
            >
              {view}
            </Link>
          ))}
        </nav>
        <nav aria-label="Whose events" className="flex overflow-hidden rounded-md border border-zinc-300 dark:border-zinc-700">
          {CALENDAR_SHOWS.map((show) => (
            <Link
              key={show}
              href={calendarHref({ ...params, show })}
              aria-current={show === params.show ? "page" : undefined}
              className={segmentClass}
            >
              {show === "mine" ? "My events" : "Team"}
            </Link>
          ))}
        </nav>
        <TimeZoneSelect params={params} />
        <ImportIcsButton timeZone={params.tz} userId={userId} />
        <PrintButton />
        <Link
          href="/calendar/events/new"
          scroll={false}
          aria-keyshortcuts="N"
          className="rounded-md bg-zinc-900 px-3 py-1 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          New event
        </Link>
      </div>
    </div>
  );
}
