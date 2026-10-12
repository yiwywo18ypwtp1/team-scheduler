import "server-only";
import { DomainError, toApiError, type ApiErrorBody } from "@/lib/errors";

/** Route Handler response in the unified `{ error: { code, message, fieldErrors? } }` format. */
export function errorResponse(error: unknown): Response {
  const { status, error: body } = toApiError(error);
  return Response.json({ error: body } satisfies ApiErrorBody, { status });
}

/** Request body as JSON; a malformed body is a 400, not a 500. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new DomainError("VALIDATION_ERROR", "Request body must be valid JSON");
  }
}

/** Version from an `If-Match: "3"` header (quotes and W/ prefix optional). */
export function parseIfMatch(request: Request): number | undefined {
  const header = request.headers.get("if-match");
  if (header === null) return undefined;
  const match = /^(?:W\/)?"?(\d+)"?$/.exec(header.trim());
  if (!match) throw new DomainError("VALIDATION_ERROR", "If-Match must be an event version, e.g. \"3\"");
  return Number(match[1]);
}
