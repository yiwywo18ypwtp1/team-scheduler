import { getNow } from "@/lib/time/now";
import { createBooking } from "@/server/booking";
import { errorResponse, readJson } from "@/server/http";
import { simulateNetwork } from "@/server/mock-network";

/**
 * POST /api/book/:slug — same body as the booking form:
 * { start, duration, guestTimeZone, answers: { name, email, notes } }.
 * 409 SLOT_TAKEN carries `details.alternatives`.
 * The Idempotency-Key header is handled at the Advanced level.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/book/[slug]">) {
  try {
    await simulateNetwork();
    const [{ slug }, body] = await Promise.all([params, readJson(request)]);
    const booking = createBooking(slug, body, getNow());
    const { cancelToken, ...publicBooking } = booking;
    return Response.json({ booking: publicBooking, token: cancelToken }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
