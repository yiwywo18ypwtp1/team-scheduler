import { conflictsQuerySchema } from "@/features/events/conflicts-schema";
import { validationError } from "@/lib/errors";
import { getConflicts } from "@/server/conflicts";
import { errorResponse, readJson } from "@/server/http";
import { simulateNetwork } from "@/server/mock-network";

/**
 * POST /api/conflicts { start, end, attendeeIds, roomId?, ignoreEventId? }
 * -> { conflicts: [{ kind: "member" | "room", memberId | roomId, name, events }] }
 * Busy time for the event form's warnings; an empty list means no conflicts.
 */
export async function POST(request: Request) {
  try {
    await simulateNetwork();
    const parsed = conflictsQuerySchema.safeParse(await readJson(request));
    if (!parsed.success) throw validationError(parsed.error);

    const { start, end, attendeeIds, roomId, ignoreEventId } = parsed.data;
    const conflicts = getConflicts({
      interval: { start: Date.parse(start), end: Date.parse(end) },
      memberIds: attendeeIds,
      roomId,
      ignoreEventId,
    });
    return Response.json({ conflicts });
  } catch (error) {
    return errorResponse(error);
  }
}
