import "server-only";
import { toApiError, type ApiErrorBody } from "@/lib/errors";

/** Route Handler response in the unified `{ error: { code, message, fieldErrors? } }` format. */
export function errorResponse(error: unknown): Response {
  const { status, error: body } = toApiError(error);
  return Response.json({ error: body } satisfies ApiErrorBody, { status });
}
