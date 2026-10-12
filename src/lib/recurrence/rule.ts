import { addDaysToDateKey, formatDateKey, isValidDateKey, weekdayOfDateKey, type DateKey } from "@/lib/time/zoned";
import type { Weekday } from "@/types/domain";

/**
 * Recurrence as the form edits it: a flat structure, serialized to an RRULE
 * (RFC 5545) only on submit and parsed back when an event is opened.
 * The rule is evaluated in the event's wall-clock time (like DTSTART;TZID=…),
 * so the monthly day / weekday come from the event's start date.
 */
export type RecurrenceFreq = "none" | "daily" | "weekly" | "monthly" | "yearly" | "custom";
/** Monthly: "on day 12", "on the 2nd Tuesday" or "on the last Friday". */
export type MonthlyMode = "dayOfMonth" | "nthWeekday" | "lastWeekday";
export type RecurrenceEnd = "never" | "count" | "until";

export type Recurrence = {
  freq: RecurrenceFreq;
  interval: number;
  /** Weekly: days of the week (0 = Sunday). Plain numbers, as the form edits them. */
  weekdays: number[];
  monthlyMode: MonthlyMode;
  end: RecurrenceEnd;
  count: number;
  /** Last day (inclusive) in the event's timezone, or "". */
  until: DateKey | "";
  /** A rule the editor can't represent, kept verbatim so it isn't lost. */
  custom: string;
};

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th"] as const;
const FREQ_CODES = { daily: "DAILY", weekly: "WEEKLY", monthly: "MONTHLY", yearly: "YEARLY" } as const;

/**
 * Weekly days, always including the start date's weekday, Monday first.
 * RFC 5545 counts DTSTART as the first occurrence, but rrule.js skips it when
 * BYDAY doesn't match, so an event created on a Tuesday would not show on
 * that Tuesday. Including the start day avoids the difference.
 */
export function weeklyDays(recurrence: Pick<Recurrence, "weekdays">, startDate: DateKey): number[] {
  return [...new Set([weekdayOfDateKey(startDate), ...recurrence.weekdays])].sort(
    (a, b) => ((a + 6) % 7) - ((b + 6) % 7),
  );
}

export function defaultRecurrence(): Recurrence {
  return {
    freq: "none",
    interval: 1,
    // The start date's weekday is implied (see weeklyDays), so nothing extra by default.
    weekdays: [],
    monthlyMode: "dayOfMonth",
    end: "never",
    count: 10,
    until: "",
    custom: "",
  };
}

function dayOfMonth(startDate: DateKey): number {
  return Number(startDate.slice(8, 10));
}

/** Which "nth weekday" the start date is: Oct 13, 2026 is the 2nd Tuesday. */
export function nthWeekdayOf(startDate: DateKey): number {
  return Math.ceil(dayOfMonth(startDate) / 7);
}

/** Whether the start date is the last such weekday of its month (offer "last Friday"). */
export function isLastWeekdayOfMonth(startDate: DateKey): boolean {
  // A week later is already next month.
  return addDaysToDateKey(startDate, 7).slice(0, 7) !== startDate.slice(0, 7);
}

/**
 * "Last Friday" only makes sense while the start date is a last Friday. If the
 * start date moved since the option was picked, fall back to "nth Friday" so
 * the rule still includes the start date.
 */
function monthlyModeFor(recurrence: Recurrence, startDate: DateKey): MonthlyMode {
  return recurrence.monthlyMode === "lastWeekday" && !isLastWeekdayOfMonth(startDate)
    ? "nthWeekday"
    : recurrence.monthlyMode;
}

/** Structure -> RRULE value (without the "RRULE:" prefix), or undefined for no repetition. */
export function recurrenceToRRule(recurrence: Recurrence, startDate: DateKey): string | undefined {
  if (recurrence.freq === "none") return undefined;
  if (recurrence.freq === "custom") return recurrence.custom.replace(/^RRULE:/i, "").trim();

  const parts = [`FREQ=${FREQ_CODES[recurrence.freq]}`];
  if (recurrence.interval > 1) parts.push(`INTERVAL=${recurrence.interval}`);

  const startDay = DAY_CODES[weekdayOfDateKey(startDate)];
  if (recurrence.freq === "weekly") {
    parts.push(`BYDAY=${weeklyDays(recurrence, startDate).map((day) => DAY_CODES[day as Weekday]).join(",")}`);
  }
  if (recurrence.freq === "monthly") {
    const mode = monthlyModeFor(recurrence, startDate);
    if (mode === "dayOfMonth") parts.push(`BYMONTHDAY=${dayOfMonth(startDate)}`);
    if (mode === "nthWeekday") parts.push(`BYDAY=${nthWeekdayOf(startDate)}${startDay}`);
    if (mode === "lastWeekday") parts.push(`BYDAY=-1${startDay}`);
  }

  if (recurrence.end === "count") parts.push(`COUNT=${recurrence.count}`);
  // End of that local day, in floating time (the rule is evaluated in wall-clock time).
  if (recurrence.end === "until") parts.push(`UNTIL=${recurrence.until.replace(/-/g, "")}T235959Z`);
  return parts.join(";");
}

/**
 * RRULE -> structure. Rules the editor can't show (other BY* parts, a
 * monthly day different from the start date, …) come back as "custom",
 * so editing other fields doesn't silently drop them.
 */
export function rruleToRecurrence(rrule: string, startDate: DateKey): Recurrence {
  const base = defaultRecurrence();
  const custom: Recurrence = { ...base, freq: "custom", custom: rrule };
  const fields = parseRRuleFields(rrule);
  if (!fields) return custom;

  const { FREQ, INTERVAL, BYDAY, BYMONTHDAY, COUNT, UNTIL, ...rest } = fields;
  if (Object.keys(rest).some((key) => key !== "WKST")) return custom;

  const freq = (Object.keys(FREQ_CODES) as (keyof typeof FREQ_CODES)[]).find((key) => FREQ_CODES[key] === FREQ);
  if (!freq) return custom;

  const recurrence: Recurrence = { ...base, freq };
  if (INTERVAL !== undefined) {
    const interval = Number(INTERVAL);
    if (!Number.isInteger(interval) || interval < 1) return custom;
    recurrence.interval = interval;
  }

  if (COUNT !== undefined && UNTIL !== undefined) return custom;
  if (COUNT !== undefined) {
    const count = Number(COUNT);
    if (!Number.isInteger(count) || count < 1) return custom;
    Object.assign(recurrence, { end: "count", count });
  }
  if (UNTIL !== undefined) {
    const match = /^(\d{4})(\d{2})(\d{2})/.exec(UNTIL);
    const until = match ? `${match[1]}-${match[2]}-${match[3]}` : "";
    if (!isValidDateKey(until)) return custom;
    Object.assign(recurrence, { end: "until", until });
  }

  const startDay = DAY_CODES[weekdayOfDateKey(startDate)];
  if (freq === "daily" || freq === "yearly") {
    return BYDAY || BYMONTHDAY ? custom : recurrence;
  }
  if (freq === "weekly") {
    if (BYMONTHDAY) return custom;
    if (!BYDAY) return recurrence; // weekly on the start's weekday
    const days = BYDAY.split(",").map((code) => DAY_CODES.indexOf(code as (typeof DAY_CODES)[number]));
    if (days.some((day) => day < 0)) return custom;
    // The editor always includes the start day; a rule without it stays as is.
    if (!days.includes(weekdayOfDateKey(startDate))) return custom;
    return { ...recurrence, weekdays: days };
  }

  // Monthly: only forms that follow from the start date are editable.
  if (BYMONTHDAY && !BYDAY) {
    return Number(BYMONTHDAY) === dayOfMonth(startDate) ? { ...recurrence, monthlyMode: "dayOfMonth" } : custom;
  }
  if (BYDAY && !BYMONTHDAY) {
    if (BYDAY === `${nthWeekdayOf(startDate)}${startDay}`) return { ...recurrence, monthlyMode: "nthWeekday" };
    if (BYDAY === `-1${startDay}`) return { ...recurrence, monthlyMode: "lastWeekday" };
    return custom;
  }
  return BYDAY || BYMONTHDAY ? custom : recurrence;
}

/** "FREQ=WEEKLY;BYDAY=MO" -> { FREQ: "WEEKLY", BYDAY: "MO" }; null if malformed. */
function parseRRuleFields(rrule: string): Record<string, string> | null {
  const body = rrule.trim().replace(/^RRULE:/i, "");
  if (!body) return null;
  const fields: Record<string, string> = {};
  for (const part of body.split(";")) {
    const [key, value, ...extra] = part.split("=");
    if (!key || !value || extra.length > 0 || fields[key.toUpperCase()] !== undefined) return null;
    fields[key.toUpperCase()] = value.toUpperCase();
  }
  return fields.FREQ ? fields : null;
}

/** "Every 2 weeks on Mon, Wed, 10 times" */
export function describeRecurrence(recurrence: Recurrence, startDate: DateKey): string {
  if (recurrence.freq === "none") return "Does not repeat";
  if (recurrence.freq === "custom") return `Custom rule: ${recurrence.custom}`;

  const { interval } = recurrence;
  const unit = { daily: "day", weekly: "week", monthly: "month", yearly: "year" }[recurrence.freq];
  let text = interval === 1 ? `Every ${unit}` : `Every ${interval} ${unit}s`;

  if (recurrence.freq === "weekly") {
    text += ` on ${weeklyDays(recurrence, startDate).map((day) => DAY_NAMES[day as Weekday]).join(", ")}`;
  }
  if (recurrence.freq === "monthly") {
    const weekdayName = formatDateKey(startDate, "EEEE");
    const mode = monthlyModeFor(recurrence, startDate);
    if (mode === "dayOfMonth") {
      const day = dayOfMonth(startDate);
      text += ` on day ${day}`;
      if (day > 28) text += " (months without it are skipped)";
    }
    if (mode === "nthWeekday") text += ` on the ${ORDINALS[nthWeekdayOf(startDate)]} ${weekdayName}`;
    if (mode === "lastWeekday") text += ` on the last ${weekdayName}`;
  }
  if (recurrence.freq === "yearly") text += ` on ${formatDateKey(startDate, "MMMM d")}`;

  if (recurrence.end === "count") text += `, ${recurrence.count} ${recurrence.count === 1 ? "time" : "times"}`;
  if (recurrence.end === "until" && isValidDateKey(recurrence.until)) {
    text += `, until ${formatDateKey(recurrence.until, "MMM d, yyyy")}`;
  }
  return text;
}

/**
 * Replaces how a rule ends: after `count` occurrences, on the `until` day
 * (inclusive, floating time), or never. Other parts are kept as they are.
 */
export function withRRuleEnd(rrule: string, end: { count: number } | { until: DateKey } | null): string {
  const parts = rrule
    .replace(/^RRULE:/i, "")
    .split(";")
    .filter((part) => part && !/^(COUNT|UNTIL)=/i.test(part));
  if (end && "count" in end) parts.push(`COUNT=${end.count}`);
  if (end && "until" in end) parts.push(`UNTIL=${end.until.replace(/-/g, "")}T235959Z`);
  return parts.join(";");
}

/** COUNT of a rule, if it has one. */
export function rruleCount(rrule: string): number | undefined {
  const match = /(?:^|;)COUNT=(\d+)/i.exec(rrule);
  return match ? Number(match[1]) : undefined;
}

/**
 * Moving an occurrence of a weekly series to another day (without touching
 * the rule) moves its weekdays along: Tue -> Wed turns "every Tue, Thu" into
 * "every Wed, Fri". Other frequencies follow the new start date by themselves
 * (day of month, nth weekday), so they are returned unchanged.
 */
export function shiftWeekdays(recurrence: Recurrence, fromDate: DateKey, toDate: DateKey): Recurrence {
  if (recurrence.freq !== "weekly") return recurrence;
  const delta = weekdayOfDateKey(toDate) - weekdayOfDateKey(fromDate);
  if (delta === 0) return recurrence;
  return {
    ...recurrence,
    weekdays: weeklyDays(recurrence, fromDate).map((day) => (((day + delta) % 7) + 7) % 7),
  };
}
