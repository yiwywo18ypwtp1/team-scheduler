import { getNow } from "@/lib/time/now";
import { createBooking } from "@/server/booking";
import { errorResponse, readJson } from "@/server/http";
import { simulateNetwork } from "@/server/mock-network";

/**
 * POST /api/book/:slug — same body as the booking form:
 * { start, duration, guestTimeZone, answers: { name, email, notes } }.
 * `Idempotency-Key` header: repeating a request returns the same booking
 * (200 + `Idempotent-Replayed: true`) instead of creating a second one;
 * reusing the key with a different body is 422.
 * 409 SLOT_TAKEN carries `details.alternatives`.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/book/[slug]">) {
  try {
    await simulateNetwork();
    const [{ slug }, body] = await Promise.all([params, readJson(request)]);
    const idempotencyKey = request.headers.get("idempotency-key") ?? undefined;
    const { booking, replayed } = createBooking(slug, body, getNow(), idempotencyKey);
    const { cancelToken, ...publicBooking } = booking;
    return Response.json(
      { booking: publicBooking, token: cancelToken },
      { status: replayed ? 200 : 201, headers: replayed ? { "Idempotent-Replayed": "true" } : undefined },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
