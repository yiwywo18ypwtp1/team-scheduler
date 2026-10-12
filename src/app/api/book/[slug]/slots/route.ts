import type { NextRequest } from "next/server";
import { z } from "zod";
import type { SlotsResponse } from "@/features/booking/schema";
import { validationError } from "@/lib/errors";
import { getNow } from "@/lib/time/now";
import { isValidDateKey, isValidTimeZone } from "@/lib/time/zoned";
import { getSlots } from "@/server/booking";
import { errorResponse } from "@/server/http";
import { simulateNetwork } from "@/server/mock-network";

const querySchema = z.object({
  from: z.string().refine(isValidDateKey, "Expected yyyy-MM-dd").optional(),
  to: z.string().refine(isValidDateKey, "Expected yyyy-MM-dd").optional(),
  tz: z.string().refine(isValidTimeZone, "Unknown timezone"),
  duration: z.coerce.number().int().positive(),
});

/**
 * GET /api/book/:slug/slots?tz&duration[&from&to]
 * Dynamic on purpose: slots depend on the current time (minNotice) and on
 * bookings made a second ago, so they can't be part of the static page.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/book/[slug]/slots">) {
  try {
    await simulateNetwork();
    const search = request.nextUrl.searchParams;
    const parsed = querySchema.safeParse({
      from: search.get("from") ?? undefined,
      to: search.get("to") ?? undefined,
      tz: search.get("tz") ?? undefined,
      duration: search.get("duration") ?? undefined,
    });
    if (!parsed.success) throw validationError(parsed.error);

    const { slug } = await params;
    const { tz, duration, from, to } = parsed.data;
    const result = getSlots(slug, { from, to, timeZone: tz, durationMinutes: duration, now: getNow() });

    const body: SlotsResponse = {
      timeZone: tz,
      from: result.from,
      to: result.to,
      firstDate: result.firstDate,
      lastDate: result.lastDate,
      slots: result.slots.map((slot) => ({
        start: new Date(slot.start).toISOString(),
        end: new Date(slot.end).toISOString(),
      })),
    };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
