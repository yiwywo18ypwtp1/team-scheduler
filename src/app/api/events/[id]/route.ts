import { DomainError } from "@/lib/errors";
import { deleteEvent, updateEvent } from "@/server/events";
import { errorResponse, parseIfMatch, readJson } from "@/server/http";
import { simulateNetwork } from "@/server/mock-network";
import { getSession } from "@/server/session";

// `scope`/`occurrence` for recurring series come with the Advanced level.

/**
 * PATCH /api/events/:id — partial body in the event form shape.
 * `If-Match: "<version>"` is required, so clients can't overwrite blindly.
 */
export async function PATCH(request: Request, { params }: RouteContext<"/api/events/[id]">) {
  try {
    await simulateNetwork();
    const expectedVersion = parseIfMatch(request);
    if (expectedVersion === undefined) {
      throw new DomainError("PRECONDITION_REQUIRED", 'Send If-Match: "<version>" to update an event');
    }

    const [{ id }, { user }, patch] = await Promise.all([params, getSession(), readJson(request)]);
    const event = updateEvent(id, patch, { actorId: user.id, expectedVersion });
    return Response.json({ event }, { headers: { ETag: `"${event.version}"` } });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/events/:id — `If-Match` is optional here. */
export async function DELETE(request: Request, { params }: RouteContext<"/api/events/[id]">) {
  try {
    await simulateNetwork();
    const [{ id }, { user }] = await Promise.all([params, getSession()]);
    deleteEvent(id, { actorId: user.id, expectedVersion: parseIfMatch(request) });
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
