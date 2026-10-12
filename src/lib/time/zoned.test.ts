import { describe, expect, it } from "vitest";
import {
  addDaysToDateKey,
  addMonthsToDateKey,
  dateKeyInTimeZone,
  dayIntervalInTimeZone,
  formatDateKey,
  formatInTimeZone,
  isValidDateKey,
  isValidTimeZone,
  parseIsoWithOffset,
  toZonedIso,
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
  it("only accepts years 1900-2100 from input", () => {
    expect(isValidDateKey("9999-12-31")).toBe(false);
    expect(isValidDateKey("1899-12-31")).toBe(false);
    expect(isValidDateKey("2100-12-31")).toBe(true);
    expect(parseIsoWithOffset("9999-01-01T00:00:00Z")).toBeUndefined();
  });

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

  it("adds months, clamping to the end of shorter months", () => {
    expect(addMonthsToDateKey("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsToDateKey("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonthsToDateKey("2026-03-31", -1)).toBe("2026-02-28");
  });

  it("formats a date regardless of the process timezone", () => {
    expect(formatDateKey("2026-10-12", "EEE, MMM d yyyy")).toBe("Mon, Oct 12 2026");
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

describe("toZonedIso", () => {
  it("formats an instant with the offset valid at that moment", () => {
    expect(toZonedIso(utc("2026-10-25T00:30:00Z"), KYIV)).toBe("2026-10-25T03:30:00+03:00");
    expect(toZonedIso(utc("2026-10-25T01:30:00Z"), KYIV)).toBe("2026-10-25T03:30:00+02:00");
    expect(toZonedIso(utc("2026-10-20T03:30:00Z"), "Asia/Kolkata")).toBe(
      "2026-10-20T09:00:00+05:30",
    );
  });

  it("round-trips through Date.parse", () => {
    const instant = utc("2026-10-12T07:15:00Z");
    expect(Date.parse(toZonedIso(instant, "America/Los_Angeles"))).toBe(instant);
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

describe("parseIsoWithOffset", () => {
  it("accepts ISO strings with an explicit offset", () => {
    expect(parseIsoWithOffset("2026-10-25T00:30:00Z")).toBe(utc("2026-10-25T00:30:00Z"));
    expect(parseIsoWithOffset("2026-10-25T03:30+03:00")).toBe(utc("2026-10-25T00:30:00Z"));
    expect(parseIsoWithOffset("2026-10-25T03:30:00.000+05:30")).toBe(utc("2026-10-24T22:00:00Z"));
  });

  it("rejects strings without an offset or invalid dates", () => {
    expect(parseIsoWithOffset("2026-10-25T00:30:00")).toBeUndefined();
    expect(parseIsoWithOffset("2026-10-25")).toBeUndefined();
    expect(parseIsoWithOffset("2026-13-45T00:00Z")).toBeUndefined();
  });
});
