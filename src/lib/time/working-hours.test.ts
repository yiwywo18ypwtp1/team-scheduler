import { describe, expect, it } from "vitest";
import { intersectAllIntervals } from "@/lib/intervals";
import type { WorkingHours } from "@/types/domain";
import { workingIntervals } from "./working-hours";

const utc = (iso: string) => Date.parse(iso);
const range = (from: string, to: string) => ({ start: utc(from), end: utc(to) });

const NINE_TO_FIVE_WEEKDAYS: WorkingHours[] = ([1, 2, 3, 4, 5] as const).map((weekday) => ({
  weekday,
  from: "09:00",
  to: "17:00",
}));

describe("workingIntervals", () => {
  it("keeps local working hours across a DST change", () => {
    // Kyiv leaves summer time on Sunday, Oct 25: 09:00 is 06:00Z before and 07:00Z after.
    const result = workingIntervals(
      NINE_TO_FIVE_WEEKDAYS,
      "Europe/Kyiv",
      range("2026-10-23T00:00:00Z", "2026-10-27T00:00:00Z"),
    );
    expect(result).toEqual([
      range("2026-10-23T06:00:00Z", "2026-10-23T14:00:00Z"),
      range("2026-10-26T07:00:00Z", "2026-10-26T15:00:00Z"),
    ]);
  });

  it("clips working hours to the requested range", () => {
    const result = workingIntervals(
      NINE_TO_FIVE_WEEKDAYS,
      "UTC",
      range("2026-10-12T12:00:00Z", "2026-10-12T15:00:00Z"),
    );
    expect(result).toEqual([range("2026-10-12T12:00:00Z", "2026-10-12T15:00:00Z")]);
  });

  it("returns nothing for an empty range", () => {
    const at = utc("2026-10-12T12:00:00Z");
    expect(workingIntervals(NINE_TO_FIVE_WEEKDAYS, "UTC", { start: at, end: at })).toEqual([]);
  });

  it("finds common hours for members 20 hours apart (Auckland and Los Angeles)", () => {
    // In late October Auckland is UTC+13 (NZDT) and Los Angeles is UTC-7 (PDT).
    // LA Monday afternoon overlaps Auckland Tuesday morning, and so on;
    // LA Friday meets Auckland Saturday, which is not a working day.
    const week = range("2026-10-19T00:00:00Z", "2026-10-26T00:00:00Z");
    const auckland = workingIntervals(NINE_TO_FIVE_WEEKDAYS, "Pacific/Auckland", week);
    const losAngeles = workingIntervals(NINE_TO_FIVE_WEEKDAYS, "America/Los_Angeles", week);

    // Auckland Monday 09:00 is Sunday 20:00Z, so it is clipped by the range start.
    expect(auckland[0]).toEqual(range("2026-10-19T00:00:00Z", "2026-10-19T04:00:00Z"));

    expect(intersectAllIntervals([auckland, losAngeles])).toEqual([
      range("2026-10-19T20:00:00Z", "2026-10-20T00:00:00Z"),
      range("2026-10-20T20:00:00Z", "2026-10-21T00:00:00Z"),
      range("2026-10-21T20:00:00Z", "2026-10-22T00:00:00Z"),
      range("2026-10-22T20:00:00Z", "2026-10-23T00:00:00Z"),
    ]);
  });
});
