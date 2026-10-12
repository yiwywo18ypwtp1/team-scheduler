import { describe, expect, it } from "vitest";
import { rangeTitle, shiftDate, visibleDays, visibleInterval } from "./range";

describe("visibleDays", () => {
  it("returns Monday to Sunday for a week", () => {
    expect(visibleDays("week", "2026-10-14")).toEqual([
      "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15",
      "2026-10-16", "2026-10-17", "2026-10-18",
    ]);
  });

  it("starts a Sunday's week on the Monday before", () => {
    expect(visibleDays("week", "2026-10-18")[0]).toBe("2026-10-12");
  });

  it("covers the month with whole weeks", () => {
    // Oct 2026: Thu 1st .. Sat 31st -> Mon Sep 28 .. Sun Nov 1.
    const october = visibleDays("month", "2026-10-20");
    expect(october).toHaveLength(35);
    expect(october[0]).toBe("2026-09-28");
    expect(october.at(-1)).toBe("2026-11-01");

    // Mar 2026: Sun 1st .. Tue 31st -> 6 rows.
    const march = visibleDays("month", "2026-03-15");
    expect(march).toHaveLength(42);
    expect(march[0]).toBe("2026-02-23");
  });
});

describe("visibleInterval", () => {
  it("spans from the first local midnight to the end of the last day, including DST", () => {
    const interval = visibleInterval(visibleDays("week", "2026-10-25"), "Europe/Kyiv");
    expect(interval.start).toBe(Date.parse("2026-10-18T21:00:00Z"));
    expect(interval.end).toBe(Date.parse("2026-10-25T22:00:00Z"));
    // 7 days with one 25-hour day.
    expect((interval.end - interval.start) / 3_600_000).toBe(7 * 24 + 1);
  });
});

describe("shiftDate", () => {
  it("moves by a week or a month", () => {
    expect(shiftDate("week", "2026-12-28", 1)).toBe("2027-01-04");
    expect(shiftDate("month", "2026-01-31", 1)).toBe("2026-02-28");
    expect(shiftDate("month", "2026-01-15", -1)).toBe("2025-12-15");
  });
});

describe("rangeTitle", () => {
  it("formats week and month titles", () => {
    expect(rangeTitle("week", "2026-10-14", visibleDays("week", "2026-10-14"))).toBe(
      "Oct 12 – 18, 2026",
    );
    expect(rangeTitle("week", "2026-10-01", visibleDays("week", "2026-10-01"))).toBe(
      "Sep 28 – Oct 4, 2026",
    );
    expect(rangeTitle("week", "2026-12-30", visibleDays("week", "2026-12-30"))).toBe(
      "Dec 28, 2026 – Jan 3, 2027",
    );
    expect(rangeTitle("month", "2026-10-14", [])).toBe("October 2026");
  });
});
