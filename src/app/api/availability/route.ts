import { findTimeSchema } from "@/features/find-time/schema";
import { DomainError, validationError } from "@/lib/errors";
import { getAvailability } from "@/server/availability";
import { errorResponse, readJson } from "@/server/http";
import { simulateNetwork } from "@/server/mock-network";

/**
 * POST /api/availability
 * Body: { memberIds, roomId?, from, to, duration, tz? } — from/to are dates
 * (inclusive) read in `tz` (default UTC), duration in minutes.
 * Returns common free windows as ISO instants.
 */
export async function POST(request: Request) {
  try {
    // The spec asks for a slow endpoint: 300-1200 ms on top of MOCK_LATENCY_MS.
    await simulateNetwork({ min: 300, max: 1200 });

    const body = await readJson(request);
    if (typeof body !== "object" || body === null) {
      throw new DomainError("VALIDATION_ERROR", "Expected a JSON object");
    }
    const parsed = findTimeSchema.safeParse({ tz: "UTC", ...body });
    if (!parsed.success) throw validationError(parsed.error);

    const { windows } = getAvailability(parsed.data);
    return Response.json({
      windows: windows.map((window) => ({
        start: new Date(window.start).toISOString(),
        end: new Date(window.end).toISOString(),
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
