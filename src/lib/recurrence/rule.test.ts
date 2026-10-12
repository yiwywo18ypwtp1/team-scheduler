import { describe, expect, it } from "vitest";
import {
  defaultRecurrence,
  describeRecurrence,
  isLastWeekdayOfMonth,
  recurrenceToRRule,
  rruleToRecurrence,
  type Recurrence,
} from "./rule";

// Tue, Oct 13, 2026: the 2nd Tuesday of the month.
const START = "2026-10-13";
const make = (overrides: Partial<Recurrence>, start = START): Recurrence => ({
  ...defaultRecurrence(start),
  ...overrides,
});

describe("recurrenceToRRule", () => {
  it.each<[Partial<Recurrence>, string | undefined]>([
    [{ freq: "none" }, undefined],
    [{ freq: "daily" }, "FREQ=DAILY"],
    [{ freq: "weekly", interval: 2, weekdays: [3, 1], end: "count", count: 10 }, "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=10"],
    [{ freq: "weekly", weekdays: [0, 6, 1] }, "FREQ=WEEKLY;BYDAY=MO,SA,SU"],
    [{ freq: "monthly", monthlyMode: "dayOfMonth" }, "FREQ=MONTHLY;BYMONTHDAY=13"],
    [{ freq: "monthly", monthlyMode: "nthWeekday" }, "FREQ=MONTHLY;BYDAY=2TU"],
    [{ freq: "yearly", end: "until", until: "2030-12-31" }, "FREQ=YEARLY;UNTIL=20301231T235959Z"],
  ])("%j -> %s", (overrides, expected) => {
    expect(recurrenceToRRule(make(overrides), START)).toBe(expected);
  });

  it("uses the last weekday for dates in the last week of a month", () => {
    expect(isLastWeekdayOfMonth("2026-10-30")).toBe(true);
    expect(isLastWeekdayOfMonth("2026-10-23")).toBe(false);
    expect(recurrenceToRRule(make({ freq: "monthly", monthlyMode: "lastWeekday" }, "2026-10-30"), "2026-10-30")).toBe(
      "FREQ=MONTHLY;BYDAY=-1FR",
    );
  });
});

describe("rruleToRecurrence", () => {
  it.each([
    "FREQ=DAILY;INTERVAL=3",
    "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=10",
    "FREQ=MONTHLY;BYMONTHDAY=13",
    "FREQ=MONTHLY;BYDAY=2TU;UNTIL=20270101T235959Z",
    "FREQ=YEARLY",
  ])("round-trips %s", (rrule) => {
    expect(recurrenceToRRule(rruleToRecurrence(rrule, START), START)).toBe(rrule);
  });

  it("accepts the RRULE: prefix and lower case", () => {
    expect(rruleToRecurrence("RRULE:freq=weekly;byday=tu", START)).toMatchObject({ freq: "weekly", weekdays: [2] });
  });

  it("keeps rules the editor can't represent as custom, unchanged", () => {
    for (const rrule of ["FREQ=MONTHLY;BYMONTHDAY=1", "FREQ=DAILY;BYHOUR=9", "FREQ=MONTHLY;BYDAY=3TU", "FREQ=HOURLY"]) {
      const recurrence = rruleToRecurrence(rrule, START);
      expect(recurrence).toMatchObject({ freq: "custom", custom: rrule });
      expect(recurrenceToRRule(recurrence, START)).toBe(rrule);
    }
  });

  it("treats malformed input as custom instead of throwing", () => {
    expect(rruleToRecurrence("garbage", START).freq).toBe("custom");
    expect(rruleToRecurrence("FREQ=DAILY;COUNT=0", START).freq).toBe("custom");
  });
});

describe("describeRecurrence", () => {
  it.each<[Partial<Recurrence>, string, string]>([
    [{ freq: "none" }, START, "Does not repeat"],
    [{ freq: "daily", interval: 1 }, START, "Every day"],
    [{ freq: "weekly", interval: 2, weekdays: [3, 1], end: "count", count: 10 }, START, "Every 2 weeks on Mon, Wed, 10 times"],
    [{ freq: "monthly", monthlyMode: "nthWeekday" }, START, "Every month on the 2nd Tuesday"],
    [{ freq: "monthly", monthlyMode: "lastWeekday" }, "2026-10-30", "Every month on the last Friday"],
    [{ freq: "monthly", monthlyMode: "dayOfMonth" }, "2026-01-31", "Every month on day 31 (months without it are skipped)"],
    [{ freq: "yearly", end: "until", until: "2030-12-31" }, START, "Every year on October 13, until Dec 31, 2030"],
  ])("%j", (overrides, start, expected) => {
    expect(describeRecurrence(make(overrides, start), start)).toBe(expected);
  });
});
