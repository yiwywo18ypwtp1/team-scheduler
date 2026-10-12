import { revalidateTag } from "next/cache";
import { bookingPageTag } from "@/features/booking/page-schema";
import { DomainError } from "@/lib/errors";
import { getBookingPage, updateBookingPage } from "@/server/booking";
import { errorResponse, readJson } from "@/server/http";
import { simulateNetwork } from "@/server/mock-network";
import { getSession } from "@/server/session";

/** GET /api/booking-pages/:slug — the page settings (public: the same data the booking page shows). */
export async function GET(_request: Request, { params }: RouteContext<"/api/booking-pages/[slug]">) {
  try {
    await simulateNetwork();
    const { slug } = await params;
    const page = getBookingPage(slug);
    if (!page) throw new DomainError("NOT_FOUND", "This booking page doesn't exist");
    return Response.json({ page });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PUT /api/booking-pages/:slug — replace the settings (owner only).
 * Then the page's cache tag is revalidated, so the static /book/:slug page is
 * rebuilt on the next request. `expire: 0` makes the next visitor get the new
 * settings right away instead of one more stale copy.
 */
export async function PUT(request: Request, { params }: RouteContext<"/api/booking-pages/[slug]">) {
  try {
    await simulateNetwork();
    const [{ slug }, { user }, body] = await Promise.all([params, getSession(), readJson(request)]);
    const page = updateBookingPage(slug, body, user.id);
    revalidateTag(bookingPageTag(slug), { expire: 0 });
    return Response.json({ page });
  } catch (error) {
    return errorResponse(error);
  }
}
