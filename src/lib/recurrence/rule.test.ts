import { describe, expect, it } from "vitest";
import {
  defaultRecurrence,
  describeRecurrence,
  isLastWeekdayOfMonth,
  recurrenceToRRule,
  rruleToRecurrence,
  shiftWeekdays,
  type Recurrence,
} from "./rule";

// Tue, Oct 13, 2026: the 2nd Tuesday of the month.
const START = "2026-10-13";
const make = (overrides: Partial<Recurrence>): Recurrence => ({
  ...defaultRecurrence(),
  ...overrides,
});

describe("recurrenceToRRule", () => {
  it.each<[Partial<Recurrence>, string | undefined]>([
    [{ freq: "none" }, undefined],
    [{ freq: "daily" }, "FREQ=DAILY"],
    [{ freq: "weekly", interval: 2, weekdays: [4], end: "count", count: 10 }, "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;COUNT=10"],
    [{ freq: "weekly", weekdays: [0, 6, 1] }, "FREQ=WEEKLY;BYDAY=MO,TU,SA,SU"],
    [{ freq: "monthly", monthlyMode: "dayOfMonth" }, "FREQ=MONTHLY;BYMONTHDAY=13"],
    [{ freq: "monthly", monthlyMode: "nthWeekday" }, "FREQ=MONTHLY;BYDAY=2TU"],
    [{ freq: "yearly", end: "until", until: "2030-12-31" }, "FREQ=YEARLY;UNTIL=20301231T235959Z"],
  ])("%j -> %s", (overrides, expected) => {
    expect(recurrenceToRRule(make(overrides), START)).toBe(expected);
  });

  it("uses the last weekday for dates in the last week of a month", () => {
    expect(isLastWeekdayOfMonth("2026-10-30")).toBe(true);
    expect(isLastWeekdayOfMonth("2026-10-23")).toBe(false);
    expect(recurrenceToRRule(make({ freq: "monthly", monthlyMode: "lastWeekday" }), "2026-10-30")).toBe(
      "FREQ=MONTHLY;BYDAY=-1FR",
    );
  });
});

describe("rruleToRecurrence", () => {
  it.each([
    "FREQ=DAILY;INTERVAL=3",
    "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;COUNT=10",
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
    const rules = ["FREQ=MONTHLY;BYMONTHDAY=1", "FREQ=DAILY;BYHOUR=9", "FREQ=MONTHLY;BYDAY=3TU", "FREQ=HOURLY", "FREQ=WEEKLY;BYDAY=MO"];
    for (const rrule of rules) {
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

describe("monthly 'last weekday' after the start date moved", () => {
  it("falls back to the nth weekday so the start date stays in the series", () => {
    const lastFriday = make({ freq: "monthly", monthlyMode: "lastWeekday" });
    expect(recurrenceToRRule(lastFriday, "2026-10-30")).toBe("FREQ=MONTHLY;BYDAY=-1FR");
    // Oct 16 is the 3rd Friday, not the last one.
    expect(recurrenceToRRule(lastFriday, "2026-10-16")).toBe("FREQ=MONTHLY;BYDAY=3FR");
    expect(describeRecurrence(lastFriday, "2026-10-16")).toBe("Every month on the 3rd Friday");
  });
});

describe("weekly start day", () => {
  it("is always part of the rule, so the first event shows on its own date", () => {
    expect(recurrenceToRRule(make({ freq: "weekly", weekdays: [] }), START)).toBe("FREQ=WEEKLY;BYDAY=TU");
    expect(recurrenceToRRule(make({ freq: "weekly", weekdays: [1, 4] }), START)).toBe("FREQ=WEEKLY;BYDAY=MO,TU,TH");
  });
});

describe("describeRecurrence", () => {
  it.each<[Partial<Recurrence>, string, string]>([
    [{ freq: "none" }, START, "Does not repeat"],
    [{ freq: "daily", interval: 1 }, START, "Every day"],
    [{ freq: "weekly", interval: 2, weekdays: [3], end: "count", count: 10 }, "2026-10-12", "Every 2 weeks on Mon, Wed, 10 times"],
    [{ freq: "monthly", monthlyMode: "nthWeekday" }, START, "Every month on the 2nd Tuesday"],
    [{ freq: "monthly", monthlyMode: "lastWeekday" }, "2026-10-30", "Every month on the last Friday"],
    [{ freq: "monthly", monthlyMode: "dayOfMonth" }, "2026-01-31", "Every month on day 31 (months without it are skipped)"],
    [{ freq: "yearly", end: "until", until: "2030-12-31" }, START, "Every year on October 13, until Dec 31, 2030"],
  ])("%j", (overrides, start, expected) => {
    expect(describeRecurrence(make(overrides), start)).toBe(expected);
  });
});

describe("shiftWeekdays", () => {
  it("moves weekly days along with an occurrence moved to another day", () => {
    // Every Tue, Thu; the Tuesday occurrence moves to Wednesday -> every Wed, Fri.
    const shifted = shiftWeekdays(make({ freq: "weekly", weekdays: [4] }), "2026-10-13", "2026-10-14");
    expect(recurrenceToRRule(shifted, "2026-10-14")).toBe("FREQ=WEEKLY;BYDAY=WE,FR");
  });

  it("wraps around the week and leaves other frequencies alone", () => {
    expect(shiftWeekdays(make({ freq: "weekly", weekdays: [6] }), "2026-10-17", "2026-10-18").weekdays).toEqual([0]);
    const monthly = make({ freq: "monthly" });
    expect(shiftWeekdays(monthly, "2026-10-13", "2026-10-14")).toBe(monthly);
  });
});
