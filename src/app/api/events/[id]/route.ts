import type { NextRequest } from "next/server";
import { DomainError } from "@/lib/errors";
import { occurrenceId, parseOccurrenceId } from "@/lib/recurrence/expand";
import { parseScope } from "@/lib/recurrence/scope";
import { parseIsoWithOffset } from "@/lib/time/zoned";
import { deleteEvent, updateEvent } from "@/server/events";
import { errorResponse, parseIfMatch, readJson } from "@/server/http";
import { simulateNetwork } from "@/server/mock-network";
import { getSession } from "@/server/session";

/**
 * Which event a request targets. A series occurrence can be addressed either
 * by its occurrence id (`<masterId>@<ms>`, as returned by GET /api/events) or
 * as in the spec: the master id plus `?occurrence=<ISO start>`.
 */
function targetId(rawId: string, request: NextRequest): string {
  // Occurrence ids contain "@", which arrives percent-encoded in route params.
  const id = decodeURIComponent(rawId);
  const occurrence = request.nextUrl.searchParams.get("occurrence");
  if (!occurrence) return id;
  const start = parseIsoWithOffset(occurrence) ?? (/^\d+$/.test(occurrence) ? Number(occurrence) : undefined);
  if (start === undefined || parseOccurrenceId(id)) {
    throw new DomainError("VALIDATION_ERROR", "Some fields are invalid", {
      occurrence: ["Use the master id with the occurrence start as ISO 8601 with offset"],
    });
  }
  return occurrenceId(id, start);
}

/**
 * PATCH /api/events/:id[?scope=this|following|all&occurrence=<ISO>]
 * Partial body in the event form shape. `If-Match: "<version>"` is required
 * (for occurrences: the series version). `scope` is required for occurrences.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext<"/api/events/[id]">) {
  try {
    await simulateNetwork();
    const expectedVersion = parseIfMatch(request);
    if (expectedVersion === undefined) {
      throw new DomainError("PRECONDITION_REQUIRED", 'Send If-Match: "<version>" to update an event');
    }

    const [{ id }, { user }, patch] = await Promise.all([params, getSession(), readJson(request)]);
    const scope = parseScope(request.nextUrl.searchParams.get("scope"));
    const event = updateEvent(targetId(id, request), patch, { actorId: user.id, expectedVersion, scope });
    return Response.json({ event }, { headers: { ETag: `"${event.version}"` } });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/events/:id[?scope=…&occurrence=…] — `If-Match` is optional here. */
export async function DELETE(request: NextRequest, { params }: RouteContext<"/api/events/[id]">) {
  try {
    await simulateNetwork();
    const [{ id }, { user }] = await Promise.all([params, getSession()]);
    const scope = parseScope(request.nextUrl.searchParams.get("scope"));
    deleteEvent(targetId(id, request), { actorId: user.id, expectedVersion: parseIfMatch(request), scope });
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
