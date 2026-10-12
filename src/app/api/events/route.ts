import type { NextRequest } from "next/server";
import { z } from "zod";
import { validationError } from "@/lib/errors";
import {
  dayIntervalInTimeZone,
  isValidDateKey,
  isValidTimeZone,
  parseIsoWithOffset,
} from "@/lib/time/zoned";
import { listEvents } from "@/server/events";
import { errorResponse } from "@/server/http";
import { simulateNetwork } from "@/server/mock-network";

const MAX_RANGE_MS = 92 * 24 * 60 * 60 * 1000;

const boundary = z
  .string()
  .refine(
    (value) => isValidDateKey(value) || parseIsoWithOffset(value) !== undefined,
    "Expected yyyy-MM-dd or ISO 8601 with offset",
  );

/**
 * `from`/`to` are ISO instants, or calendar dates read in `tz`; a date `to`
 * is inclusive (the whole day). Members filter by attendee; none = all events.
 */
const querySchema = z
  .object({
    from: boundary,
    to: boundary,
    tz: z.string().refine(isValidTimeZone, "Unknown timezone").default("UTC"),
    members: z.array(z.string().min(1)).default([]),
  })
  .transform(({ from, to, tz, members }) => ({
    start: parseIsoWithOffset(from) ?? dayIntervalInTimeZone(from, tz).start,
    end: parseIsoWithOffset(to) ?? dayIntervalInTimeZone(to, tz).end,
    memberIds: members,
  }))
  .refine((range) => range.end > range.start, { message: "`to` must be after `from`", path: ["to"] })
  .refine((range) => range.end - range.start <= MAX_RANGE_MS, {
    message: "Range must not exceed 92 days",
    path: ["to"],
  });

/** GET /api/events?from&to&tz&members[] */
export async function GET(request: NextRequest) {
  try {
    await simulateNetwork();

    const search = request.nextUrl.searchParams;
    const parsed = querySchema.safeParse({
      from: search.get("from") ?? undefined,
      to: search.get("to") ?? undefined,
      tz: search.get("tz") ?? undefined,
      // Accept both `members[]=a&members[]=b` (as in the spec) and `members=a`.
      members: [...search.getAll("members[]"), ...search.getAll("members")],
    });
    if (!parsed.success) throw validationError(parsed.error);

    return Response.json({ events: listEvents(parsed.data) });
  } catch (error) {
    return errorResponse(error);
  }
}
