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

/** Agenda: the first window around the date; more is loaded while scrolling. */
export const AGENDA_DAYS_BEFORE = 7;
export const AGENDA_DAYS_AFTER = 21;

/**
 * Days shown for a view: 1 for a day, 7 for a week, whole weeks covering the
 * month (5 or 6 rows) for a month, and the initial window for the agenda.
 */
export function visibleDays(view: CalendarView, date: DateKey): DateKey[] {
  if (view === "day") return [date];
  if (view === "week") return daysFrom(startOfWeek(date), 7);
  if (view === "agenda") {
    return daysFrom(addDaysToDateKey(date, -AGENDA_DAYS_BEFORE), AGENDA_DAYS_BEFORE + AGENDA_DAYS_AFTER);
  }

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
  if (view === "day") return addDaysToDateKey(date, step);
  if (view === "month") return addMonthsToDateKey(date, step);
  return addDaysToDateKey(date, 7 * step); // week, agenda
}

/** "Oct 12 – 18, 2026", "Sep 28 – Oct 4, 2026", "Dec 28, 2026 – Jan 3, 2027" or "October 2026". */
export function rangeTitle(view: CalendarView, date: DateKey, days: DateKey[]): string {
  if (view === "month") return formatDateKey(date, "MMMM yyyy");
  if (view === "day") return formatDateKey(date, "EEEE, MMMM d, yyyy");
  if (view === "agenda") return `Agenda from ${formatDateKey(date, "MMM d, yyyy")}`;

  const first = days[0];
  const last = days.at(-1);
  if (!first || !last) return "";

  const sameYear = first.slice(0, 4) === last.slice(0, 4);
  const sameMonth = first.slice(0, 7) === last.slice(0, 7);
  const start = formatDateKey(first, sameYear ? "MMM d" : "MMM d, yyyy");
  const end = formatDateKey(last, sameMonth ? "d, yyyy" : "MMM d, yyyy");
  return `${start} – ${end}`;
}
