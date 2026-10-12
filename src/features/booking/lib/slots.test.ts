import { describe, expect, it } from "vitest";
import { intersectIntervals } from "@/lib/intervals";
import { workingIntervals } from "@/lib/time/working-hours";
import { formatInTimeZone } from "@/lib/time/zoned";
import type { WorkingHours } from "@/types/domain";
import { bookableWindow, computeSlots, groupSlotsByDay, nearestSlots } from "./slots";

const utc = (iso: string) => Date.parse(iso);
const iv = (from: string, to: string) => ({ start: utc(from), end: utc(to) });
const starts = (slots: { start: number }[]) => slots.map((slot) => new Date(slot.start).toISOString().slice(11, 16));

const NINE_TO_FIVE: WorkingHours[] = ([1, 2, 3, 4, 5] as const).map((weekday) => ({
  weekday,
  from: "09:00",
  to: "17:00",
}));

describe("computeSlots", () => {
  const working = [iv("2026-10-20T09:00:00Z", "2026-10-20T12:00:00Z")];

  it("steps through working time on a 30-minute grid", () => {
    const slots = computeSlots({ working, busy: [], durationMinutes: 60, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 });
    expect(starts(slots)).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00"]);
  });

  it("keeps buffers around busy time", () => {
    // Busy 10:00-10:30; 15 min needed before a booking, 10 min after.
    const slots = computeSlots({
      working,
      busy: [iv("2026-10-20T10:00:00Z", "2026-10-20T10:30:00Z")],
      durationMinutes: 30,
      bufferBeforeMinutes: 15,
      bufferAfterMinutes: 10,
    });
    // 09:30 would end at 10:00, leaving no 10-min gap before the busy block;
    // 10:30 would start right after it, without the 15-min gap.
    expect(starts(slots)).toEqual(["09:00", "11:00", "11:30"]);
  });

  it("aligns the first slot to the grid", () => {
    const slots = computeSlots({
      working: [iv("2026-10-20T09:10:00Z", "2026-10-20T10:30:00Z")],
      busy: [],
      durationMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
    });
    expect(starts(slots)).toEqual(["09:30", "10:00"]);
  });
});

describe("minNotice at the boundary (owner in New York, guest in Kolkata)", () => {
  // Owner works 09:00-17:00 New York time (EDT, UTC-4 in October).
  const owner = { workingHours: NINE_TO_FIVE, timeZone: "America/New_York" };
  const now = utc("2026-10-19T13:00:00Z"); // Mon 09:00 in New York, 18:30 in Kolkata

  function slotsFor(nowInstant: number) {
    const window = bookableWindow({ now: nowInstant, minNoticeMinutes: 24 * 60, horizonDays: 30 });
    const range = intersectIntervals([iv("2026-10-19T00:00:00Z", "2026-10-22T00:00:00Z")], [window]);
    const working = range.flatMap((r) => workingIntervals(owner.workingHours, owner.timeZone, r));
    return computeSlots({ working, busy: [], durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 });
  }

  it("allows a slot exactly 24 h ahead", () => {
    expect(slotsFor(now)[0]?.start).toBe(utc("2026-10-20T13:00:00Z"));
  });

  it("drops it one minute later", () => {
    expect(slotsFor(now + 60_000)[0]?.start).toBe(utc("2026-10-20T13:30:00Z"));
  });

  it("shows the owner's afternoon as the guest's late evening and next day", () => {
    const byDay = groupSlotsByDay(slotsFor(now), "Asia/Kolkata");
    const tuesday = byDay.get("2026-10-20") ?? [];
    expect(formatInTimeZone(tuesday[0]!.start, "Asia/Kolkata", "HH:mm")).toBe("18:30");
    // 14:30 in New York is already 00:00 the next day in Kolkata (UTC+5:30).
    expect(formatInTimeZone(byDay.get("2026-10-21")![0]!.start, "Asia/Kolkata", "HH:mm")).toBe("00:00");
  });
});

describe("bookableWindow", () => {
  it("starts after the notice and ends at the horizon", () => {
    const now = utc("2026-10-19T13:00:00Z");
    expect(bookableWindow({ now, minNoticeMinutes: 60, horizonDays: 14 })).toEqual(
      iv("2026-10-19T14:00:00Z", "2026-11-02T13:00:00Z"),
    );
  });
});

describe("nearestSlots", () => {
  it("picks the closest slots and returns them in order", () => {
    const slots = ["09:00", "10:00", "11:00", "14:00", "16:00"].map((time) =>
      iv(`2026-10-20T${time}:00Z`, `2026-10-20T${time}:00Z`),
    );
    expect(starts(nearestSlots(slots, utc("2026-10-20T10:30:00Z"), 3))).toEqual(["09:00", "10:00", "11:00"]);
  });
});
