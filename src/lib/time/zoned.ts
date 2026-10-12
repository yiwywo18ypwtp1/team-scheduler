import { TZDate, tzOffset } from "@date-fns/tz";
import { addDays, addMonths, format, getDay } from "date-fns";
import type { Interval } from "@/lib/intervals";
import type { Weekday } from "@/types/domain";

/** Calendar date without time or timezone, "yyyy-MM-dd". Sorts correctly as a string. */
export type DateKey = string;

const DATE_KEY_FORMAT = "yyyy-MM-dd";
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
// Intl alone also accepts raw offsets like "+05:30"; the spec wants IANA names.
const IANA_NAME_PATTERN = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/;

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * Years accepted from user input (URLs, forms, API). Keeps date maths away
 * from 5-digit years and stops requests that would expand recurring series
 * over thousands of years.
 */
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2100;
const MIN_INSTANT = Date.UTC(MIN_YEAR, 0, 1);
const MAX_INSTANT = Date.UTC(MAX_YEAR + 1, 0, 1);

export function isSupportedInstant(instant: number): boolean {
  return Number.isFinite(instant) && instant >= MIN_INSTANT && instant < MAX_INSTANT;
}

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
// depends on the timezone of the process. Built from the regex groups rather
// than date-fns `parse`, which is ~50x slower and dominated seeding time.
function parseDateKey(dateKey: DateKey): TZDate | undefined {
  const match = DATE_KEY_PATTERN.exec(dateKey);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new TZDate(year, month, day, "UTC");
  // The Date constructor rolls invalid days over (Feb 30 -> Mar 2); reject those.
  const isSameDate =
    date.getFullYear() === year && date.getMonth() === month && date.getDate() === day;
  return isSameDate ? date : undefined;
}

function requireDateKey(dateKey: DateKey): TZDate {
  const date = parseDateKey(dateKey);
  if (!date) throw new Error(`Invalid date "${dateKey}", expected yyyy-MM-dd`);
  return date;
}

/** Rejects malformed and non-existent dates such as "2026-02-30", and years outside MIN_YEAR..MAX_YEAR. */
export function isValidDateKey(value: string): boolean {
  const date = parseDateKey(value);
  return date !== undefined && date.getFullYear() >= MIN_YEAR && date.getFullYear() <= MAX_YEAR;
}

export function addDaysToDateKey(dateKey: DateKey, days: number): DateKey {
  return format(addDays(requireDateKey(dateKey), days), DATE_KEY_FORMAT);
}

/** Clamps to the last day of the month: Jan 31 + 1 month = Feb 28. */
export function addMonthsToDateKey(dateKey: DateKey, months: number): DateKey {
  return format(addMonths(requireDateKey(dateKey), months), DATE_KEY_FORMAT);
}

/** Formats a calendar date with a date-fns pattern, e.g. "MMM d". */
export function formatDateKey(dateKey: DateKey, pattern: string): string {
  return format(requireDateKey(dateKey), pattern);
}

export function weekdayOfDateKey(dateKey: DateKey): Weekday {
  return getDay(requireDateKey(dateKey)) as Weekday;
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

const ISO_WITH_OFFSET_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Parses an ISO 8601 date-time that carries an explicit offset ("Z" or "+03:00").
 * Strings without an offset are rejected: they would be read in the server's timezone.
 */
export function parseIsoWithOffset(value: string): number | undefined {
  if (!ISO_WITH_OFFSET_PATTERN.test(value)) return undefined;
  const instant = Date.parse(value);
  return isSupportedInstant(instant) ? instant : undefined;
}

/** ISO 8601 with the offset `timeZone` has at that instant, e.g. "2026-10-12T10:00:00+03:00". */
export function toZonedIso(instant: number, timeZone: string): string {
  return formatInTimeZone(instant, timeZone, "yyyy-MM-dd'T'HH:mm:ssXXX");
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
  const date = requireDateKey(dateKey);
  // The same wall-clock reading as if it were UTC; real offsets are subtracted below.
  const wallAsUtc = new TZDate(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    Number(match[1]),
    Number(match[2]),
    "UTC",
  ).getTime();

  return floatingToInstant(wallAsUtc, timeZone);
}

/**
 * "Floating" time: the wall-clock reading of an instant in `timeZone`, encoded
 * as epoch ms as if it were UTC. Recurrence rules are evaluated in floating
 * time, so "every day at 03:30" stays 03:30 local across DST changes.
 */
export function instantToFloating(instant: number, timeZone: string): number {
  return instant + tzOffset(timeZone, new Date(instant)) * MINUTE_MS;
}

/**
 * Floating wall-clock time -> real instant in `timeZone`, resolving DST like
 * Temporal's "compatible" mode (see `wallTimeToInstant`).
 */
export function floatingToInstant(floating: number, timeZone: string): number {
  // A day before and after covers at most one DST transition in real timezones.
  const offsetBefore = tzOffset(timeZone, new Date(floating - DAY_MS));
  const offsetAfter = tzOffset(timeZone, new Date(floating + DAY_MS));

  // Fast path (almost always): no transition nearby, so the offset is unambiguous.
  if (offsetBefore === offsetAfter) return floating - offsetBefore * MINUTE_MS;

  // A candidate is valid when the zone really has that offset at that instant:
  // two valid candidates mean an overlap, none means a gap.
  const candidates = [offsetBefore, offsetAfter]
    .map((offset) => ({ offset, instant: floating - offset * MINUTE_MS }))
    .filter(({ offset, instant }) => tzOffset(timeZone, new Date(instant)) === offset)
    .map(({ instant }) => instant);

  if (candidates.length > 0) return Math.min(...candidates);

  // Gap: reading the time with the pre-transition offset lands right after the gap.
  return floating - offsetBefore * MINUTE_MS;
}

/** The whole calendar day in `timeZone`: 23 or 25 hours long on DST days. */
export function dayIntervalInTimeZone(dateKey: DateKey, timeZone: string): Interval {
  return {
    start: wallTimeToInstant(dateKey, "00:00", timeZone),
    end: wallTimeToInstant(addDaysToDateKey(dateKey, 1), "00:00", timeZone),
  };
}
