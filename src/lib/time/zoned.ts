import { TZDate, tzOffset } from "@date-fns/tz";
import { addDays, format, getDay, isValid, parse } from "date-fns";
import type { Interval } from "@/lib/intervals";
import type { Weekday } from "@/types/domain";

/** Calendar date without time or timezone, "yyyy-MM-dd". Sorts correctly as a string. */
export type DateKey = string;

const DATE_KEY_FORMAT = "yyyy-MM-dd";
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
// Intl alone also accepts raw offsets like "+05:30"; the spec wants IANA names.
const IANA_NAME_PATTERN = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/;

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export function isValidTimeZone(timeZone: string): boolean {
  if (!IANA_NAME_PATTERN.test(timeZone)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

// Date-only arithmetic runs on a UTC-anchored TZDate, so the result never
// depends on the timezone of the process.
function parseDateKey(dateKey: DateKey): TZDate {
  return parse(dateKey, DATE_KEY_FORMAT, new TZDate(0, "UTC"));
}

/** Rejects malformed and non-existent dates such as "2026-02-30". */
export function isValidDateKey(value: string): boolean {
  return DATE_KEY_PATTERN.test(value) && isValid(parseDateKey(value));
}

export function addDaysToDateKey(dateKey: DateKey, days: number): DateKey {
  return format(addDays(parseDateKey(dateKey), days), DATE_KEY_FORMAT);
}

export function weekdayOfDateKey(dateKey: DateKey): Weekday {
  return getDay(parseDateKey(dateKey)) as Weekday;
}

/** Calendar date of an instant as seen in `timeZone`. */
export function dateKeyInTimeZone(instant: number, timeZone: string): DateKey {
  return formatInTimeZone(instant, timeZone, DATE_KEY_FORMAT);
}

export function formatInTimeZone(
  instant: number,
  timeZone: string,
  pattern: string,
): string {
  return format(new TZDate(instant, timeZone), pattern);
}

/**
 * Converts a wall-clock time ("HH:mm") on a date in `timeZone` to a UTC instant.
 *
 * DST is resolved like Temporal's "compatible" mode:
 * - a time inside a spring-forward gap moves forward by the gap (03:30 -> 04:30);
 * - an ambiguous time in a fall-back overlap resolves to the earlier instant.
 *
 * The offset is resolved here explicitly because TZDate's constructor picks
 * a different instant for ambiguous times depending on the process timezone.
 */
export function wallTimeToInstant(
  dateKey: DateKey,
  time: string,
  timeZone: string,
): number {
  const match = TIME_PATTERN.exec(time);
  if (!match) throw new Error(`Invalid time "${time}", expected HH:mm`);
  if (!isValidDateKey(dateKey)) throw new Error(`Invalid date "${dateKey}"`);

  const date = parseDateKey(dateKey);
  // The same wall-clock reading as if it were UTC; real offsets are subtracted below.
  const wallAsUtc = new TZDate(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    Number(match[1]),
    Number(match[2]),
    "UTC",
  ).getTime();

  // A day before and after covers at most one DST transition in real timezones.
  const offsetBefore = tzOffset(timeZone, new Date(wallAsUtc - DAY_MS));
  const offsetAfter = tzOffset(timeZone, new Date(wallAsUtc + DAY_MS));

  // A candidate is valid when the zone really has that offset at that instant:
  // two valid candidates mean an overlap, none means a gap.
  const candidates = [offsetBefore, offsetAfter]
    .map((offset) => ({ offset, instant: wallAsUtc - offset * MINUTE_MS }))
    .filter(({ offset, instant }) => tzOffset(timeZone, new Date(instant)) === offset)
    .map(({ instant }) => instant);

  if (candidates.length > 0) return Math.min(...candidates);

  // Gap: reading the time with the pre-transition offset lands right after the gap.
  return wallAsUtc - offsetBefore * MINUTE_MS;
}

/** The whole calendar day in `timeZone`: 23 or 25 hours long on DST days. */
export function dayIntervalInTimeZone(dateKey: DateKey, timeZone: string): Interval {
  return {
    start: wallTimeToInstant(dateKey, "00:00", timeZone),
    end: wallTimeToInstant(addDaysToDateKey(dateKey, 1), "00:00", timeZone),
  };
}
