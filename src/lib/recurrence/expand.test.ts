import { describe, expect, it } from "vitest";
import { formatInTimeZone } from "@/lib/time/zoned";
import { makeEvent } from "@/test/factories";
import { expandEvent, occurrenceId, occurrencesOf, parseOccurrenceId } from "./expand";

const KYIV = "Europe/Kyiv";
const utc = (iso: string) => Date.parse(iso);
const range = (from: string, to: string) => ({ start: utc(from), end: utc(to) });
const local = (instant: number, tz = KYIV) => formatInTimeZone(instant, tz, "yyyy-MM-dd HH:mm");

describe("occurrencesOf across DST (Kyiv, Oct 25, 2026)", () => {
  const daily0330 = {
    start: "2026-10-23T03:30:00+03:00",
    end: "2026-10-23T04:00:00+03:00",
    timezone: KYIV,
    rrule: "FREQ=DAILY",
  };

  it("keeps 03:30 local every day and doesn't duplicate the repeated hour", () => {
    const occurrences = occurrencesOf(daily0330, range("2026-10-22T00:00:00Z", "2026-10-28T00:00:00Z"));
    expect(occurrences.map((o) => local(o.start))).toEqual([
      "2026-10-23 03:30",
      "2026-10-24 03:30",
      "2026-10-25 03:30",
      "2026-10-26 03:30",
      "2026-10-27 03:30",
    ]);
    // The real offset changes: 00:30Z in summer time, 01:30Z after it.
    expect(new Date(occurrences[2]!.start).toISOString()).toBe("2026-10-25T00:30:00.000Z");
    expect(new Date(occurrences[3]!.start).toISOString()).toBe("2026-10-26T01:30:00.000Z");
  });

  it("doesn't lose the occurrence in the spring-forward gap", () => {
    const occurrences = occurrencesOf(
      { ...daily0330, start: "2026-03-27T03:30:00+02:00", end: "2026-03-27T04:00:00+02:00" },
      range("2026-03-28T00:00:00Z", "2026-03-31T00:00:00Z"),
    );
    // 03:30 doesn't exist on Mar 29; it moves to 04:30.
    expect(occurrences.map((o) => local(o.start))).toEqual(["2026-03-28 03:30", "2026-03-29 04:30", "2026-03-30 03:30"]);
  });
});

describe("occurrencesOf monthly edge cases", () => {
  it("skips months without the 31st", () => {
    const occurrences = occurrencesOf(
      { start: "2026-01-31T10:00:00Z", end: "2026-01-31T11:00:00Z", timezone: "UTC", rrule: "FREQ=MONTHLY;BYMONTHDAY=31" },
      range("2026-01-01T00:00:00Z", "2026-08-01T00:00:00Z"),
    );
    expect(occurrences.map((o) => local(o.start, "UTC").slice(0, 10))).toEqual([
      "2026-01-31",
      "2026-03-31",
      "2026-05-31",
      "2026-07-31",
    ]);
  });

  it("finds the last Friday of each month", () => {
    const occurrences = occurrencesOf(
      { start: "2026-10-30T15:00:00+02:00", end: "2026-10-30T16:00:00+02:00", timezone: KYIV, rrule: "FREQ=MONTHLY;BYDAY=-1FR" },
      range("2026-10-01T00:00:00Z", "2027-03-01T00:00:00Z"),
    );
    expect(occurrences.map((o) => local(o.start))).toEqual([
      "2026-10-30 15:00",
      "2026-11-27 15:00",
      "2026-12-25 15:00",
      "2027-01-29 15:00",
      "2027-02-26 15:00",
    ]);
  });
});

describe("occurrencesOf limits and exceptions", () => {
  const weekly = {
    start: "2026-10-12T10:00:00+03:00",
    end: "2026-10-12T11:00:00+03:00",
    timezone: KYIV,
    rrule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=5",
  };
  const all = range("2026-01-01T00:00:00Z", "2027-01-01T00:00:00Z");

  it("honours COUNT and INTERVAL", () => {
    expect(occurrencesOf(weekly, all).map((o) => local(o.start).slice(0, 10))).toEqual([
      "2026-10-12",
      "2026-10-14",
      "2026-10-26",
      "2026-10-28",
      "2026-11-09",
    ]);
  });

  it("removes exdates", () => {
    const occurrences = occurrencesOf({ ...weekly, exdates: ["2026-10-14T10:00:00+03:00"] }, all);
    expect(occurrences.map((o) => local(o.start).slice(0, 10))).toEqual(["2026-10-12", "2026-10-26", "2026-10-28", "2026-11-09"]);
  });

  it("honours UNTIL as the last local day", () => {
    const occurrences = occurrencesOf({ ...weekly, rrule: "FREQ=DAILY;UNTIL=20261014T235959Z" }, all);
    expect(occurrences).toHaveLength(3);
  });

  it("returns only occurrences overlapping the range, and respects a limit", () => {
    expect(occurrencesOf({ ...weekly, rrule: "FREQ=DAILY" }, range("2026-10-20T00:00:00Z", "2026-10-22T00:00:00Z"))).toHaveLength(2);
    expect(occurrencesOf({ ...weekly, rrule: "FREQ=DAILY" }, all, 5)).toHaveLength(5);
  });
});

describe("occurrencesOf regressions", () => {
  it("counts the limit only on returned occurrences, not on earlier candidates", () => {
    const daily = { start: "2026-10-01T10:00:00Z", end: "2026-10-01T11:00:00Z", timezone: "UTC", rrule: "FREQ=DAILY" };
    const occurrences = occurrencesOf(daily, range("2026-10-10T00:00:00Z", "2026-12-01T00:00:00Z"), 3);
    expect(occurrences.map((o) => local(o.start, "UTC"))).toEqual(["2026-10-10 10:00", "2026-10-11 10:00", "2026-10-12 10:00"]);
  });
});

describe("expandEvent", () => {
  it("shows a series with a broken stored rule once instead of failing", () => {
    const broken = makeEvent({ id: "bad", start: "2026-10-13T10:00:00Z", end: "2026-10-13T11:00:00Z", rrule: "FREQ=NOPE" });
    const warn = console.warn;
    console.warn = () => {};
    try {
      expect(expandEvent(broken, range("2026-10-01T00:00:00Z", "2026-11-01T00:00:00Z"))).toMatchObject([
        { id: "bad", rrule: undefined },
      ]);
    } finally {
      console.warn = warn;
    }
  });

  it("turns a master into virtual occurrences that point to it", () => {
    const master = makeEvent({
      id: "evt_m",
      start: "2026-10-12T10:00:00+03:00",
      end: "2026-10-12T11:00:00+03:00",
      timezone: KYIV,
      rrule: "FREQ=DAILY;COUNT=3",
      version: 4,
    });
    const instances = expandEvent(master, range("2026-10-13T00:00:00Z", "2026-10-20T00:00:00Z"));
    expect(instances).toHaveLength(2);
    expect(instances[0]).toMatchObject({
      id: occurrenceId("evt_m", utc("2026-10-13T07:00:00Z")),
      seriesId: "evt_m",
      rrule: undefined,
      start: "2026-10-13T10:00:00+03:00",
      version: 4,
    });
  });

  it("passes single events through when they overlap", () => {
    const single = makeEvent({ id: "s", start: "2026-10-13T10:00:00Z", end: "2026-10-13T11:00:00Z" });
    expect(expandEvent(single, range("2026-10-13T00:00:00Z", "2026-10-14T00:00:00Z"))).toEqual([single]);
    expect(expandEvent(single, range("2026-10-14T00:00:00Z", "2026-10-15T00:00:00Z"))).toEqual([]);
  });
});

describe("occurrence ids", () => {
  it("round-trip", () => {
    expect(parseOccurrenceId(occurrenceId("evt_1a-b", 1760000000000))).toEqual({
      masterId: "evt_1a-b",
      originalStart: 1760000000000,
    });
    expect(parseOccurrenceId("evt_plain")).toBeNull();
  });
});
