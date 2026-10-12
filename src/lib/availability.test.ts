import { describe, expect, it } from "vitest";
import { makeEvent } from "@/test/factories";
import type { WorkingHours } from "@/types/domain";
import { busyIntervalsFor, findCommonWindows, roomBusyIntervals, type MemberSchedule } from "./availability";

const utc = (iso: string) => Date.parse(iso);
const range = (from: string, to: string) => ({ start: utc(from), end: utc(to) });
const HOUR = 60 * 60 * 1000;

const NINE_TO_FIVE: WorkingHours[] = ([1, 2, 3, 4, 5] as const).map((weekday) => ({
  weekday,
  from: "09:00",
  to: "17:00",
}));

const auckland = (busy: MemberSchedule["busy"] = []): MemberSchedule => ({
  workingHours: NINE_TO_FIVE,
  timeZone: "Pacific/Auckland",
  busy,
});
const losAngeles = (busy: MemberSchedule["busy"] = []): MemberSchedule => ({
  workingHours: NINE_TO_FIVE,
  timeZone: "America/Los_Angeles",
  busy,
});

const NEXT_WEEK = range("2026-10-19T00:00:00Z", "2026-10-26T00:00:00Z");

describe("findCommonWindows", () => {
  it("finds the overlap of Auckland mornings and Los Angeles afternoons", () => {
    // Auckland is UTC+13 and LA is UTC-7: LA Mon 13:00-17:00 = Auckland Tue 09:00-13:00.
    expect(
      findCommonWindows({ schedules: [auckland(), losAngeles()], range: NEXT_WEEK, minDurationMs: HOUR }),
    ).toEqual([
      range("2026-10-19T20:00:00Z", "2026-10-20T00:00:00Z"),
      range("2026-10-20T20:00:00Z", "2026-10-21T00:00:00Z"),
      range("2026-10-21T20:00:00Z", "2026-10-22T00:00:00Z"),
      range("2026-10-22T20:00:00Z", "2026-10-23T00:00:00Z"),
    ]);
  });

  it("removes busy time and drops windows that became too short", () => {
    const windows = findCommonWindows({
      schedules: [
        // Busy 21:00-22:30Z on Monday (Tue 10:00-11:30 in Auckland).
        auckland([range("2026-10-19T21:00:00Z", "2026-10-19T22:30:00Z")]),
        // Busy the whole Tuesday overlap.
        losAngeles([range("2026-10-20T20:00:00Z", "2026-10-21T00:00:00Z")]),
      ],
      range: NEXT_WEEK,
      minDurationMs: HOUR,
    });
    expect(windows).toEqual([
      // Mon: 20:00-21:00 (1 h, kept) and 22:30-00:00 (1.5 h, kept).
      range("2026-10-19T20:00:00Z", "2026-10-19T21:00:00Z"),
      range("2026-10-19T22:30:00Z", "2026-10-20T00:00:00Z"),
      range("2026-10-21T20:00:00Z", "2026-10-22T00:00:00Z"),
      range("2026-10-22T20:00:00Z", "2026-10-23T00:00:00Z"),
    ]);
  });

  it("respects the minimum duration", () => {
    const windows = findCommonWindows({
      schedules: [auckland(), losAngeles()],
      range: NEXT_WEEK,
      minDurationMs: 5 * HOUR,
    });
    expect(windows).toEqual([]);
  });

  it("subtracts room bookings", () => {
    const windows = findCommonWindows({
      schedules: [losAngeles()],
      extraBusy: [range("2026-10-19T16:00:00Z", "2026-10-19T23:00:00Z")],
      range: range("2026-10-19T00:00:00Z", "2026-10-20T00:00:00Z"),
      minDurationMs: HOUR,
    });
    // LA Monday is 16:00-24:00Z; the room is free only for the last hour.
    expect(windows).toEqual([range("2026-10-19T23:00:00Z", "2026-10-20T00:00:00Z")]);
  });

  it("returns nothing without schedules", () => {
    expect(findCommonWindows({ schedules: [], range: NEXT_WEEK, minDurationMs: HOUR })).toEqual([]);
  });
});

describe("busyIntervalsFor", () => {
  const events = [
    makeEvent({
      id: "accepted",
      start: "2026-10-19T09:00:00Z",
      end: "2026-10-19T10:00:00Z",
      attendees: [{ memberId: "a", status: "accepted" }],
    }),
    makeEvent({
      id: "declined",
      start: "2026-10-19T11:00:00Z",
      end: "2026-10-19T12:00:00Z",
      attendees: [{ memberId: "a", status: "declined" }],
    }),
    makeEvent({
      id: "pending-overlapping",
      start: "2026-10-19T09:30:00Z",
      end: "2026-10-19T10:30:00Z",
      attendees: [{ memberId: "a", status: "pending" }],
    }),
    makeEvent({
      id: "someone-else",
      start: "2026-10-19T14:00:00Z",
      end: "2026-10-19T15:00:00Z",
      attendees: [{ memberId: "b", status: "accepted" }],
    }),
  ];

  it("counts attended events except declined ones, merged", () => {
    expect(busyIntervalsFor(events, "a")).toEqual([range("2026-10-19T09:00:00Z", "2026-10-19T10:30:00Z")]);
  });
});

describe("roomBusyIntervals", () => {
  it("collects events booked in the room", () => {
    const events = [
      makeEvent({ id: "r1", start: "2026-10-19T09:00:00Z", end: "2026-10-19T10:00:00Z", location: { kind: "room", roomId: "room_1" } }),
      makeEvent({ id: "r2", start: "2026-10-19T11:00:00Z", end: "2026-10-19T12:00:00Z", location: { kind: "room", roomId: "room_2" } }),
      makeEvent({ id: "u", start: "2026-10-19T13:00:00Z", end: "2026-10-19T14:00:00Z", location: { kind: "url", url: "https://x.y" } }),
    ];
    expect(roomBusyIntervals(events, "room_1")).toEqual([range("2026-10-19T09:00:00Z", "2026-10-19T10:00:00Z")]);
  });
});
