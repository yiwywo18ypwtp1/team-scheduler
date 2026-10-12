import type { Interval } from "@/lib/intervals";
import {
  addDaysToDateKey,
  addMonthsToDateKey,
  dayIntervalInTimeZone,
  formatDateKey,
  weekdayOfDateKey,
  type DateKey,
} from "@/lib/time/zoned";
import type { CalendarView } from "./params";

// Weeks start on Monday. A locale-dependent first day is a Bonus feature.
function startOfWeek(date: DateKey): DateKey {
  const daysSinceMonday = (weekdayOfDateKey(date) + 6) % 7;
  return addDaysToDateKey(date, -daysSinceMonday);
}

function daysFrom(start: DateKey, count: number): DateKey[] {
  return Array.from({ length: count }, (_, index) => addDaysToDateKey(start, index));
}

/**
 * Days shown for a view: 7 for a week, whole weeks covering the month
 * (5 or 6 rows) for a month.
 */
export function visibleDays(view: CalendarView, date: DateKey): DateKey[] {
  if (view === "week") return daysFrom(startOfWeek(date), 7);

  const firstOfMonth = `${date.slice(0, 7)}-01`;
  const lastOfMonth = addDaysToDateKey(addMonthsToDateKey(firstOfMonth, 1), -1);
  const gridStart = startOfWeek(firstOfMonth);
  const gridEnd = addDaysToDateKey(startOfWeek(lastOfMonth), 7);

  const days: DateKey[] = [];
  for (let day = gridStart; day < gridEnd; day = addDaysToDateKey(day, 1)) days.push(day);
  return days;
}

/** Time covered by the visible days in the display timezone; used to load events. */
export function visibleInterval(days: DateKey[], timeZone: string): Interval {
  const first = days[0];
  const last = days.at(-1);
  if (!first || !last) throw new Error("No visible days");
  return {
    start: dayIntervalInTimeZone(first, timeZone).start,
    end: dayIntervalInTimeZone(last, timeZone).end,
  };
}

/** The date one period before or after, for prev/next navigation. */
export function shiftDate(view: CalendarView, date: DateKey, step: 1 | -1): DateKey {
  return view === "week" ? addDaysToDateKey(date, 7 * step) : addMonthsToDateKey(date, step);
}

/** "Oct 12 – 18, 2026", "Sep 28 – Oct 4, 2026", "Dec 28, 2026 – Jan 3, 2027" or "October 2026". */
export function rangeTitle(view: CalendarView, date: DateKey, days: DateKey[]): string {
  if (view === "month") return formatDateKey(date, "MMMM yyyy");

  const first = days[0];
  const last = days.at(-1);
  if (!first || !last) return "";

  const sameYear = first.slice(0, 4) === last.slice(0, 4);
  const sameMonth = first.slice(0, 7) === last.slice(0, 7);
  const start = formatDateKey(first, sameYear ? "MMM d" : "MMM d, yyyy");
  const end = formatDateKey(last, sameMonth ? "d, yyyy" : "MMM d, yyyy");
  return `${start} – ${end}`;
}
