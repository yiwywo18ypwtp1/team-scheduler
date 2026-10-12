import { describe, expect, it } from "vitest";
import {
  addDaysToDateKey,
  dateKeyInTimeZone,
  dayIntervalInTimeZone,
  formatInTimeZone,
  isValidDateKey,
  isValidTimeZone,
  wallTimeToInstant,
  weekdayOfDateKey,
} from "./zoned";

const utc = (iso: string) => Date.parse(iso);
const HOUR = 60 * 60 * 1000;

// Europe/Kyiv 2026: clocks go 03:00 -> 04:00 on Mar 29 and 04:00 -> 03:00 on Oct 25.
const KYIV = "Europe/Kyiv";

describe("isValidTimeZone", () => {
  it.each(["Europe/Kyiv", "UTC", "Asia/Kolkata", "America/Argentina/Buenos_Aires", "Etc/GMT+5"])(
    "accepts %s",
    (tz) => expect(isValidTimeZone(tz)).toBe(true),
  );

  it.each(["Mars/Base", "+05:30", "", "Europe/Kyiv; drop"])("rejects %j", (tz) =>
    expect(isValidTimeZone(tz)).toBe(false),
  );
});

describe("date keys", () => {
  it("rejects malformed and non-existent dates", () => {
    expect(isValidDateKey("2026-02-30")).toBe(false);
    expect(isValidDateKey("2026-2-3")).toBe(false);
    expect(isValidDateKey("2026-10-12T00:00")).toBe(false);
    expect(isValidDateKey("2028-02-29")).toBe(true);
  });

  it("adds days across month and year boundaries", () => {
    expect(addDaysToDateKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToDateKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysToDateKey("2026-10-24", 2)).toBe("2026-10-26");
  });

  it("returns the weekday of a date", () => {
    expect(weekdayOfDateKey("2026-10-12")).toBe(1);
    expect(weekdayOfDateKey("2026-10-25")).toBe(0);
  });

  it("returns the local date of an instant", () => {
    const instant = utc("2026-10-12T22:30:00Z");
    expect(dateKeyInTimeZone(instant, KYIV)).toBe("2026-10-13");
    expect(dateKeyInTimeZone(instant, "America/Los_Angeles")).toBe("2026-10-12");
  });
});

describe("wallTimeToInstant", () => {
  it("converts a regular wall time", () => {
    expect(wallTimeToInstant("2026-10-12", "10:00", KYIV)).toBe(utc("2026-10-12T07:00:00Z"));
  });

  it("handles half-hour offsets", () => {
    expect(wallTimeToInstant("2026-10-20", "09:00", "Asia/Kolkata")).toBe(
      utc("2026-10-20T03:30:00Z"),
    );
  });

  it("moves a time inside a spring-forward gap forward", () => {
    // 03:30 does not exist on Mar 29 in Kyiv; it becomes 04:30 EEST.
    expect(wallTimeToInstant("2026-03-29", "03:30", KYIV)).toBe(utc("2026-03-29T01:30:00Z"));
  });

  it("resolves an ambiguous fall-back time to the earlier instant", () => {
    // 03:30 happens twice on Oct 25 in Kyiv: 00:30Z (EEST) and 01:30Z (EET).
    expect(wallTimeToInstant("2026-10-25", "03:30", KYIV)).toBe(utc("2026-10-25T00:30:00Z"));
  });

  it("handles a missing midnight", () => {
    // Chile skips 00:00-01:00 on Sep 6, 2026.
    expect(wallTimeToInstant("2026-09-06", "00:00", "America/Santiago")).toBe(
      utc("2026-09-06T04:00:00Z"),
    );
  });

  it("rejects malformed input", () => {
    expect(() => wallTimeToInstant("2026-10-12", "24:00", KYIV)).toThrow();
    expect(() => wallTimeToInstant("2026-10-12", "9:00", KYIV)).toThrow();
    expect(() => wallTimeToInstant("2026-02-30", "09:00", KYIV)).toThrow();
  });
});

describe("formatInTimeZone", () => {
  it("shows both instants of a repeated hour with the same wall time", () => {
    expect(formatInTimeZone(utc("2026-10-25T00:30:00Z"), KYIV, "HH:mm")).toBe("03:30");
    expect(formatInTimeZone(utc("2026-10-25T01:30:00Z"), KYIV, "HH:mm")).toBe("03:30");
  });
});

describe("dayIntervalInTimeZone", () => {
  const length = (dateKey: string, tz: string) => {
    const day = dayIntervalInTimeZone(dateKey, tz);
    return (day.end - day.start) / HOUR;
  };

  it("has 24, 23 and 25 hours on regular and DST days", () => {
    expect(length("2026-10-12", KYIV)).toBe(24);
    expect(length("2026-03-29", KYIV)).toBe(23);
    expect(length("2026-10-25", KYIV)).toBe(25);
  });

  it("starts at local midnight", () => {
    expect(dayIntervalInTimeZone("2026-10-20", "Asia/Kolkata").start).toBe(
      utc("2026-10-19T18:30:00Z"),
    );
  });
});
