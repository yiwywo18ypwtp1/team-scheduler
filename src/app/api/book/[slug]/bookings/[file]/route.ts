import type { NextRequest } from "next/server";
import { buildIcs } from "@/features/booking/lib/ics";
import { DomainError } from "@/lib/errors";
import { getBookingForGuest, getBookingPage } from "@/server/booking";
import { errorResponse } from "@/server/http";
import { getMember } from "@/server/members";

/**
 * GET /api/book/:slug/bookings/:id.ics?token=
 * A route segment can't be "[id].ics", so the whole file name is the param.
 * The token from the confirmation link is required: the file contains the
 * guest's answers.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/book/[slug]/bookings/[file]">) {
  try {
    const { slug, file } = await params;
    const id = /^(.+)\.ics$/.exec(file)?.[1];
    const token = request.nextUrl.searchParams.get("token") ?? "";
    const booking = id ? getBookingForGuest(id, token) : undefined;
    const page = getBookingPage(slug);
    if (!booking || !page || booking.slug !== slug) throw new DomainError("NOT_FOUND", "Booking not found");

    const owner = getMember(page.ownerId);
    const ics = buildIcs({
      uid: `${booking.id}@team-scheduler`,
      start: Date.parse(booking.start),
      end: Date.parse(booking.end),
      createdAt: Date.parse(booking.createdAt),
      summary: owner ? `${page.title} with ${owner.name}` : page.title,
      description: booking.answers.notes || undefined,
      organizer: owner ? { name: owner.name, email: owner.email } : undefined,
    });

    return new Response(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${page.slug}.ics"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
