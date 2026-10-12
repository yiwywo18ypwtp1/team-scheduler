import "server-only";
import { cookies, headers } from "next/headers";
import { firstDayOfWeek, localeFromAcceptLanguage } from "@/lib/time/week";
import { isValidTimeZone } from "@/lib/time/zoned";
import type { Member, Weekday } from "@/types/domain";
import { getMember, listMembers } from "./members";

// No authentication: the "current user" is just a preference stored in a cookie.
const USER_COOKIE = "ts_user";
const TIME_ZONE_COOKIE = "ts_tz";
const WEEK_START_COOKIE = "ts_week";
const ONE_YEAR_S = 60 * 60 * 24 * 365;
/** Used when no valid user cookie is set (first seeded member). */
const DEFAULT_USER_ID = "mem_01";

export type Session = {
  user: Member;
  /** User's preferred timezone: the override if set, otherwise the member's own. */
  timeZone: string;
  timeZoneOverride?: string;
  /** 0 = Sunday … 6 = Saturday: the user's choice, else from the browser language. */
  weekStartsOn: Weekday;
  weekStartOverride?: Weekday;
};

export async function getSession(): Promise<Session> {
  const store = await cookies();

  // Unknown or missing user falls back to a default member instead of failing.
  const userId = store.get(USER_COOKIE)?.value;
  const user = (userId && getMember(userId)) || getMember(DEFAULT_USER_ID) || listMembers()[0];
  if (!user) throw new Error("Seed data has no members");

  const cookieTimeZone = store.get(TIME_ZONE_COOKIE)?.value;
  const timeZoneOverride =
    cookieTimeZone && isValidTimeZone(cookieTimeZone) ? cookieTimeZone : undefined;

  const weekCookie = store.get(WEEK_START_COOKIE)?.value;
  const weekStartOverride = weekCookie && /^[0-6]$/.test(weekCookie) ? (Number(weekCookie) as Weekday) : undefined;
  const weekStartsOn =
    weekStartOverride ?? firstDayOfWeek(localeFromAcceptLanguage((await headers()).get("accept-language")));

  return { user, timeZone: timeZoneOverride ?? user.timezone, timeZoneOverride, weekStartsOn, weekStartOverride };
}

/** Must be called from a Server Action or Route Handler (cookies are read-only in render). */
export async function saveSessionPreferences(preferences: {
  userId: string;
  /** Empty string means "use the member's own timezone". */
  timeZone: string;
  /** "0".."6", or empty for "from the browser language". */
  weekStart: string;
}) {
  const store = await cookies();
  const options = { httpOnly: true, sameSite: "lax", path: "/", maxAge: ONE_YEAR_S } as const;

  store.set(USER_COOKIE, preferences.userId, options);
  if (preferences.timeZone) {
    store.set(TIME_ZONE_COOKIE, preferences.timeZone, options);
  } else {
    store.delete(TIME_ZONE_COOKIE);
  }
  if (preferences.weekStart) {
    store.set(WEEK_START_COOKIE, preferences.weekStart, options);
  } else {
    store.delete(WEEK_START_COOKIE);
  }
}
