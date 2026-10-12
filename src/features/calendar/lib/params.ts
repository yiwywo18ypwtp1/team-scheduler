import {
  dateKeyInTimeZone,
  isValidDateKey,
  isValidTimeZone,
  type DateKey,
} from "@/lib/time/zoned";

// Core level: Day and Agenda views come with the Advanced level.
export const CALENDAR_VIEWS = ["week", "month"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

/** The calendar's URL state: `/calendar?view=week&date=2026-10-12&tz=Europe/Kyiv`. */
export type CalendarParams = { view: CalendarView; date: DateKey; tz: string };

type RawSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isCalendarView(value: string): value is CalendarView {
  return (CALENDAR_VIEWS as readonly string[]).includes(value);
}

/**
 * Reads calendar params from the URL. Missing values fall back to defaults;
 * invalid ones (`?view=year`, `?date=2026-02-30`, `?tz=Mars/Base`) also fall
 * back, and `isValid: false` tells the page to redirect to the canonical URL,
 * so the address bar never disagrees with what is rendered.
 */
export function parseCalendarParams(
  raw: RawSearchParams,
  defaults: { now: number; timeZone: string },
): { params: CalendarParams; isValid: boolean } {
  const rawView = first(raw.view);
  const rawDate = first(raw.date);
  const rawTz = first(raw.tz);

  const viewOk = rawView === undefined || isCalendarView(rawView);
  const dateOk = rawDate === undefined || isValidDateKey(rawDate);
  const tzOk = rawTz === undefined || isValidTimeZone(rawTz);

  // "Today" depends on the timezone being displayed, so resolve tz first.
  const tz = rawTz && tzOk ? rawTz : defaults.timeZone;
  const view = rawView && viewOk ? (rawView as CalendarView) : "week";
  const date = rawDate && dateOk ? rawDate : dateKeyInTimeZone(defaults.now, tz);

  return { params: { view, date, tz }, isValid: viewOk && dateOk && tzOk };
}

export function calendarHref(params: CalendarParams): string {
  const search = new URLSearchParams({ view: params.view, date: params.date, tz: params.tz });
  return `/calendar?${search}`;
}
