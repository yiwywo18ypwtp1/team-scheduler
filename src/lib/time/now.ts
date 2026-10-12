const ISO_WITH_OFFSET = /(Z|[+-]\d{2}:\d{2})$/;

/**
 * Current instant in epoch ms. `MOCK_NOW` (ISO string with offset) freezes
 * "now" to check DST and minNotice edge cases.
 *
 * Call it at the server edges (pages, actions, route handlers) and pass `now`
 * into pure functions as an argument, so they stay deterministic in tests.
 * The env var is not exposed to the browser.
 */
export function getNow(): number {
  const mockNow = process.env.MOCK_NOW;
  if (!mockNow) return Date.now();

  const instant = Date.parse(mockNow);
  if (!ISO_WITH_OFFSET.test(mockNow) || Number.isNaN(instant)) {
    throw new Error(
      `Invalid MOCK_NOW "${mockNow}", expected ISO with offset, e.g. 2026-10-25T00:30:00Z`,
    );
  }
  return instant;
}
