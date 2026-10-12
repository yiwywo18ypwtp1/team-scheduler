import { z } from "zod";
import type { Interval } from "@/lib/intervals";
import {
  addDaysToDateKey,
  dayIntervalInTimeZone,
  isValidDateKey,
  isValidTimeZone,
} from "@/lib/time/zoned";

export const MAX_SEARCH_DAYS = 14;
export const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 240] as const;

/**
 * One schema for the find-time form, its URL (/find-time?members=..&duration=..)
 * and POST /api/availability. Dates are calendar days in `tz`, both inclusive.
 */
export const findTimeSchema = z
  .object({
    memberIds: z.array(z.string().min(1)).min(1, "Choose at least one person").max(15, "Choose up to 15 people"),
    /** Empty string or missing = no room needed. */
    roomId: z.string().optional(),
    from: z.string().refine(isValidDateKey, "Enter a valid date"),
    to: z.string().refine(isValidDateKey, "Enter a valid date"),
    tz: z.string().refine(isValidTimeZone, "Unknown timezone"),
    duration: z
      .number({ message: "Choose a duration" })
      .int()
      .min(15, "At least 15 minutes")
      .max(480, "At most 8 hours")
      .refine((minutes) => minutes % 15 === 0, "Use 15-minute steps"),
  })
  .superRefine((query, ctx) => {
    if (!isValidDateKey(query.from) || !isValidDateKey(query.to)) return;
    if (query.to < query.from) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "End date must not be before start date" });
    } else if (query.to > addDaysToDateKey(query.from, MAX_SEARCH_DAYS - 1)) {
      ctx.addIssue({ code: "custom", path: ["to"], message: `Search up to ${MAX_SEARCH_DAYS} days at a time` });
    }
  });

export type FindTimeQuery = z.infer<typeof findTimeSchema>;

/** UTC bounds of the searched days, from the first local midnight to the end of the last day. */
export function searchRange(query: Pick<FindTimeQuery, "from" | "to" | "tz">): Interval {
  return {
    start: dayIntervalInTimeZone(query.from, query.tz).start,
    end: dayIntervalInTimeZone(query.to, query.tz).end,
  };
}

// URL encoding: members=a,b&duration=60&from=..&to=..&tz=..[&room=..]

export function findTimeSearchParams(query: FindTimeQuery): string {
  const params = new URLSearchParams({
    members: query.memberIds.join(","),
    duration: String(query.duration),
    from: query.from,
    to: query.to,
    tz: query.tz,
  });
  if (query.roomId) params.set("room", query.roomId);
  return params.toString();
}

type RawSearchParams = Record<string, string | string[] | undefined>;

/** Raw URL params -> schema input; validation happens in `findTimeSchema`. */
export function findTimeInputFromSearchParams(raw: RawSearchParams) {
  const first = (key: string) => {
    const value = raw[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const duration = first("duration");
  return {
    memberIds: (first("members") ?? "").split(",").filter(Boolean),
    roomId: first("room") || undefined,
    from: first("from") ?? "",
    to: first("to") ?? "",
    tz: first("tz") ?? "",
    duration: duration === undefined || duration === "" ? undefined : Number(duration),
  };
}
