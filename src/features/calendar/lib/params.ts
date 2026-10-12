import {
  dateKeyInTimeZone,
  isValidDateKey,
  isValidTimeZone,
  type DateKey,
} from "@/lib/time/zoned";

// Core level: Day and Agenda views come with the Advanced level.
export const CALENDAR_VIEWS = ["week", "month"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

/** Whose events to show: the current user's, or everyone's (team overview). */
export const CALENDAR_SHOWS = ["mine", "team"] as const;
export type CalendarShow = (typeof CALENDAR_SHOWS)[number];

/** The calendar's URL state: `/calendar?view=week&date=2026-10-12&tz=Europe/Kyiv[&show=team]`. */
export type CalendarParams = { view: CalendarView; date: DateKey; tz: string; show: CalendarShow };

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
  const rawShow = first(raw.show);

  const viewOk = rawView === undefined || isCalendarView(rawView);
  const dateOk = rawDate === undefined || isValidDateKey(rawDate);
  const tzOk = rawTz === undefined || isValidTimeZone(rawTz);
  const showOk = rawShow === undefined || (CALENDAR_SHOWS as readonly string[]).includes(rawShow);

  // "Today" depends on the timezone being displayed, so resolve tz first.
  const tz = rawTz && tzOk ? rawTz : defaults.timeZone;
  const view = rawView && viewOk ? (rawView as CalendarView) : "week";
  const date = rawDate && dateOk ? rawDate : dateKeyInTimeZone(defaults.now, tz);
  const show = rawShow && showOk ? (rawShow as CalendarShow) : "mine";

  return { params: { view, date, tz, show }, isValid: viewOk && dateOk && tzOk && showOk };
}

export function calendarHref(params: CalendarParams): string {
  const search = new URLSearchParams({ view: params.view, date: params.date, tz: params.tz });
  // "mine" is the default, so it is left out to keep URLs short.
  if (params.show === "team") search.set("show", "team");
  return `/calendar?${search}`;
}
