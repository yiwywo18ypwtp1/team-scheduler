import { afterEach, describe, expect, it, vi } from "vitest";
import { getNow } from "./now";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getNow", () => {
  it("returns the real time without MOCK_NOW", () => {
    vi.stubEnv("MOCK_NOW", "");
    const before = Date.now();
    const now = getNow();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });

  it("returns the frozen instant from MOCK_NOW", () => {
    vi.stubEnv("MOCK_NOW", "2026-10-25T00:30:00Z");
    expect(getNow()).toBe(Date.parse("2026-10-25T00:30:00Z"));
  });

  it("rejects MOCK_NOW without an offset, since it would depend on the server timezone", () => {
    vi.stubEnv("MOCK_NOW", "2026-10-25T00:30:00");
    expect(() => getNow()).toThrow(/MOCK_NOW/);
  });
});
