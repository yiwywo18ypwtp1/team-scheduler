import Link from "next/link";
import { formatDateKey, type DateKey } from "@/lib/time/zoned";
import type { CalendarEvent } from "@/types/domain";
import { buildMonthLayout, MONTH_VISIBLE_LANES } from "../lib/month-layout";
import { calendarHref, type CalendarShow } from "../lib/params";
import { EventLabel } from "./EventLabel";
import { eventToneClass } from "./event-style";
import { MoreEventsPopover } from "./MoreEventsPopover";

type Props = {
  events: CalendarEvent[];
  days: DateKey[];
  /** Any date inside the displayed month. */
  date: DateKey;
  timeZone: string;
  show: CalendarShow;
  today: DateKey;
  currentUserId: string;
};


/**
 * Server Component. Only the visible lanes are rendered here; "+N more" is a
 * small client popover that loads that day's full list when opened.
 */
export function MonthView({ events, days, date, timeZone, show, today, currentUserId }: Props) {
  const weeks = buildMonthLayout({ events, days, timeZone });
  const month = date.slice(0, 7);

  return (
    <div
      role="grid"
      aria-readonly
      aria-label={formatDateKey(date, "MMMM yyyy")}
      className="flex flex-1 flex-col overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800"
    >
      <div role="row" className="grid grid-cols-7 border-b border-zinc-200 dark:border-zinc-800">
        {/* Labels follow the first day of the week (by locale or setting). */}
        {days.slice(0, 7).map((day) => formatDateKey(day, "EEE")).map((label) => (
          <div key={label} role="columnheader" className="py-2 text-center text-xs text-zinc-500">
            {label}
          </div>
        ))}
      </div>

      {weeks.map((week) => (
        <div
          key={week.days[0]}
          role="row"
          className="grid flex-1 grid-cols-7 border-b border-zinc-200 last:border-b-0 dark:border-zinc-800"
          // Row 1: day number, rows 2..N+1: lanes, last row: "+N more" and the
          // remaining height, so day cells stretch to the bottom of the row.
          style={{
            gridTemplateRows: `1.75rem repeat(${MONTH_VISIBLE_LANES}, 1.375rem) minmax(1.5rem, 1fr)`,
          }}
        >
          {week.days.map((day, index) => (
            <div
              key={day}
              role="gridcell"
              aria-label={formatDateKey(day, "EEEE, MMMM d")}
              aria-current={day === today ? "date" : undefined}
              className={`border-l border-zinc-200 px-1.5 pt-1 first:border-l-0 dark:border-zinc-800 ${
                day.slice(0, 7) === month ? "" : "bg-zinc-50 text-zinc-400 dark:bg-zinc-900/60"
              }`}
              style={{ gridColumn: index + 1, gridRow: "1 / -1" }}
            >
              <Link
                href={calendarHref({ view: "week", date: day, tz: timeZone, show })}
                className={`inline-flex size-6 items-center justify-center rounded-full text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700 ${
                  day === today ? "bg-blue-600 font-semibold text-white hover:bg-blue-700" : ""
                }`}
              >
                {formatDateKey(day, "d")}
              </Link>
            </div>
          ))}

          {week.bars.map((bar) => (
            <Link
              key={bar.event.id}
              href={`/calendar/events/${bar.event.id}`}
              scroll={false}
              className={`z-10 mx-0.5 truncate rounded border px-1.5 text-xs leading-5 ${eventToneClass(bar.event, currentUserId)}`}
              style={{ gridColumn: `${bar.startIndex + 1} / ${bar.endIndex + 1}`, gridRow: bar.lane + 2 }}
              title={bar.event.title}
            >
              <EventLabel event={bar.event} timeZone={timeZone} />
            </Link>
          ))}

          {week.hiddenCounts.map((count, index) => {
            const day = week.days[index];
            if (count === 0 || !day) return null;
            return (
              <div
                key={day}
                className="z-10 self-start px-1"
                style={{ gridColumn: index + 1, gridRow: MONTH_VISIBLE_LANES + 2 }}
              >
                <MoreEventsPopover day={day} count={count} timeZone={timeZone} show={show} currentUserId={currentUserId} />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
