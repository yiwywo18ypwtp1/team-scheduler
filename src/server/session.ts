import "server-only";
import { cookies } from "next/headers";
import { isValidTimeZone } from "@/lib/time/zoned";
import type { Member } from "@/types/domain";
import { getMember, listMembers } from "./members";

// No authentication: the "current user" is just a preference stored in a cookie.
const USER_COOKIE = "ts_user";
const TIME_ZONE_COOKIE = "ts_tz";
const ONE_YEAR_S = 60 * 60 * 24 * 365;

export type Session = {
  user: Member;
  /** User's preferred timezone: the override if set, otherwise the member's own. */
  timeZone: string;
  timeZoneOverride?: string;
};

export async function getSession(): Promise<Session> {
  const store = await cookies();

  // Unknown or missing user falls back to the first member instead of failing.
  const userId = store.get(USER_COOKIE)?.value;
  const user = (userId && getMember(userId)) || listMembers()[0];
  if (!user) throw new Error("Seed data has no members");

  const cookieTimeZone = store.get(TIME_ZONE_COOKIE)?.value;
  const timeZoneOverride =
    cookieTimeZone && isValidTimeZone(cookieTimeZone) ? cookieTimeZone : undefined;

  return { user, timeZone: timeZoneOverride ?? user.timezone, timeZoneOverride };
}

/** Must be called from a Server Action or Route Handler (cookies are read-only in render). */
export async function saveSessionPreferences(preferences: {
  userId: string;
  /** Empty string means "use the member's own timezone". */
  timeZone: string;
}) {
  const store = await cookies();
  const options = { httpOnly: true, sameSite: "lax", path: "/", maxAge: ONE_YEAR_S } as const;

  store.set(USER_COOKIE, preferences.userId, options);
  if (preferences.timeZone) {
    store.set(TIME_ZONE_COOKIE, preferences.timeZone, options);
  } else {
    store.delete(TIME_ZONE_COOKIE);
  }
}
