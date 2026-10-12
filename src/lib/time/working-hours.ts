import { intersectIntervals, type Interval } from "@/lib/intervals";
import type { WorkingHours } from "@/types/domain";
import {
  addDaysToDateKey,
  dateKeyInTimeZone,
  wallTimeToInstant,
  weekdayOfDateKey,
} from "./zoned";

/**
 * Working time of one member inside `range`, as UTC intervals.
 *
 * Rules are wall-clock times in the member's own timezone, so every local date
 * is converted separately. That keeps DST weeks correct: 09:00 stays 09:00
 * local even though its UTC offset changes mid-week.
 * Rules with `to <= from` (overnight shifts) are not supported and are ignored.
 */
export function workingIntervals(
  workingHours: readonly WorkingHours[],
  timeZone: string,
  range: Interval,
): Interval[] {
  if (range.end <= range.start) return [];

  // Any local day that overlaps the range lies between these two dates.
  const firstDate = dateKeyInTimeZone(range.start, timeZone);
  const lastDate = dateKeyInTimeZone(range.end - 1, timeZone);

  const intervals: Interval[] = [];
  for (let date = firstDate; date <= lastDate; date = addDaysToDateKey(date, 1)) {
    const weekday = weekdayOfDateKey(date);
    for (const rule of workingHours) {
      if (rule.weekday !== weekday) continue;
      intervals.push({
        start: wallTimeToInstant(date, rule.from, timeZone),
        end: wallTimeToInstant(date, rule.to, timeZone),
      });
    }
  }
  return intersectIntervals(intervals, [range]);
}
