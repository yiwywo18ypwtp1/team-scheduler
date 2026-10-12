import { parseIsoWithOffset } from "./zoned";

/**
 * Frozen "now" from `MOCK_NOW` (ISO with offset), used to check DST and
 * minNotice edge cases. Undefined when the real clock should be used.
 * Server-only in practice: the env var is not exposed to the browser, so pages
 * pass this value down to client components that show the current time.
 */
export function getMockNow(): number | undefined {
  const mockNow = process.env.MOCK_NOW;
  if (!mockNow) return undefined;

  const instant = parseIsoWithOffset(mockNow);
  if (instant === undefined) {
    throw new Error(
      `Invalid MOCK_NOW "${mockNow}", expected ISO with offset, e.g. 2026-10-25T00:30:00Z`,
    );
  }
  return instant;
}

/**
 * Current instant in epoch ms. Call it at the server edges (pages, actions,
 * route handlers) and pass `now` into pure functions as an argument, so they
 * stay deterministic in tests.
 */
export function getNow(): number {
  return getMockNow() ?? Date.now();
}
