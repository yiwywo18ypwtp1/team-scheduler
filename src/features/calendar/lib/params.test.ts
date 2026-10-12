import { describe, expect, it } from "vitest";
import { calendarHref, parseCalendarParams } from "./params";

// 22:30 UTC on Oct 12 is already Oct 13 in Kyiv.
const defaults = { now: Date.parse("2026-10-12T22:30:00Z"), timeZone: "Europe/Kyiv" };

describe("parseCalendarParams", () => {
  it("uses defaults when params are missing, without asking for a redirect", () => {
    expect(parseCalendarParams({}, defaults)).toEqual({
      params: { view: "week", date: "2026-10-13", tz: "Europe/Kyiv" },
      isValid: true,
    });
  });

  it("computes today in the requested timezone", () => {
    const { params } = parseCalendarParams({ tz: "America/Los_Angeles" }, defaults);
    expect(params.date).toBe("2026-10-12");
  });

  it("keeps valid params", () => {
    expect(
      parseCalendarParams({ view: "month", date: "2026-02-28", tz: "Asia/Kolkata" }, defaults),
    ).toEqual({ params: { view: "month", date: "2026-02-28", tz: "Asia/Kolkata" }, isValid: true });
  });

  it.each([
    [{ view: "year" }, { view: "week" }],
    [{ date: "2026-02-30" }, { date: "2026-10-13" }],
    [{ tz: "Mars/Base" }, { tz: "Europe/Kyiv" }],
  ])("falls back and flags invalid %j", (raw, expected) => {
    const result = parseCalendarParams(raw, defaults);
    expect(result.isValid).toBe(false);
    expect(result.params).toMatchObject(expected);
  });

  it("takes the first value of repeated params", () => {
    const { params } = parseCalendarParams({ view: ["month", "week"] }, defaults);
    expect(params.view).toBe("month");
  });
});

describe("calendarHref", () => {
  it("builds an encoded URL", () => {
    expect(calendarHref({ view: "week", date: "2026-10-12", tz: "Europe/Kyiv" })).toBe(
      "/calendar?view=week&date=2026-10-12&tz=Europe%2FKyiv",
    );
  });
});
