import { describe, expect, it } from "vitest";
import { makeEvent } from "@/test/factories";
import { visibleDays } from "./range";
import { buildWeekLayout } from "./week-layout";

const KYIV = "Europe/Kyiv";

function build(events: Parameters<typeof makeEvent>[0][], date = "2026-10-14", timeZone = KYIV) {
  return buildWeekLayout({
    events: events.map(makeEvent),
    days: visibleDays("week", date),
    timeZone,
    workingHours: [],
  });
}

describe("buildWeekLayout", () => {
  it("positions timed events in minutes from local midnight", () => {
    const layout = build([
      { id: "a", start: "2026-10-14T10:00:00+03:00", end: "2026-10-14T11:30:00+03:00" },
    ]);
    const wednesday = layout.days[2]!;
    expect(wednesday.segments).toMatchObject([{ startMinute: 600, endMinute: 690 }]);
    expect(layout.days.filter((day) => day.segments.length > 0)).toHaveLength(1);
  });

  it("splits an event crossing midnight across two columns", () => {
    const layout = build([
      { id: "late", start: "2026-10-14T23:00:00+03:00", end: "2026-10-15T01:00:00+03:00" },
    ]);
    expect(layout.days[2]!.segments).toMatchObject([
      { startMinute: 1380, endMinute: 1440, continuesBefore: false, continuesAfter: true },
    ]);
    expect(layout.days[3]!.segments).toMatchObject([
      { startMinute: 0, endMinute: 60, continuesBefore: true, continuesAfter: false },
    ]);
  });

  it("shows events in the display timezone", () => {
    // 10:00 in Kyiv is 00:00 in Los Angeles on the same day.
    const layout = build(
      [{ id: "a", start: "2026-10-14T10:00:00+03:00", end: "2026-10-14T11:00:00+03:00" }],
      "2026-10-14",
      "America/Los_Angeles",
    );
    expect(layout.days[2]!.segments).toMatchObject([{ startMinute: 0, endMinute: 60 }]);
  });

  it("moves all-day and 24h+ events to the strip", () => {
    const layout = build([
      { id: "allday", start: "2026-10-13T00:00:00+03:00", end: "2026-10-15T00:00:00+03:00", allDay: true },
      { id: "long", start: "2026-10-16T09:00:00+03:00", end: "2026-10-17T17:00:00+03:00" },
      { id: "timed", start: "2026-10-14T09:00:00+03:00", end: "2026-10-14T10:00:00+03:00" },
    ]);
    expect(layout.strip).toMatchObject([
      { event: { id: "allday" }, startIndex: 1, endIndex: 3, lane: 0 },
      { event: { id: "long" }, startIndex: 4, endIndex: 6, lane: 0 },
    ]);
    expect(layout.stripLaneCount).toBe(1);
    expect(layout.days.flatMap((day) => day.segments.map((s) => s.event.id))).toEqual(["timed"]);
  });

  it("keeps all-day events on their date in any display timezone", () => {
    const layout = build(
      [{ id: "holiday", start: "2026-10-14T00:00:00+03:00", end: "2026-10-15T00:00:00+03:00", allDay: true, timezone: KYIV }],
      "2026-10-14",
      "Pacific/Auckland",
    );
    expect(layout.strip).toMatchObject([{ startIndex: 2, endIndex: 3 }]);
  });

  it("clips strip bars to the visible week", () => {
    const layout = build([
      { id: "trip", start: "2026-10-10T00:00:00+03:00", end: "2026-10-21T00:00:00+03:00", allDay: true },
    ]);
    expect(layout.strip).toMatchObject([{ startIndex: 0, endIndex: 7 }]);
  });

  it("renders the 25-hour DST day without duplicating or losing the repeated hour", () => {
    // Oct 25 in Kyiv: 03:00-04:00 happens twice (EEST, then EET).
    const layout = build(
      [
        { id: "first-0330", start: "2026-10-25T03:30:00+03:00", end: "2026-10-25T04:30:00+03:00" },
        { id: "second-0330", start: "2026-10-25T03:30:00+02:00", end: "2026-10-25T04:30:00+02:00" },
      ],
      "2026-10-25",
    );
    const sunday = layout.days[6]!;
    expect(sunday.minutes).toBe(25 * 60);
    expect(sunday.segments.map((s) => [s.event.id, s.startMinute])).toEqual([
      ["first-0330", 210],
      ["second-0330", 270],
    ]);
  });

  it("returns working-hours blocks per day", () => {
    const layout = buildWeekLayout({
      events: [],
      days: visibleDays("week", "2026-10-14"),
      timeZone: KYIV,
      workingHours: [{ start: Date.parse("2026-10-14T06:00:00Z"), end: Date.parse("2026-10-14T14:00:00Z") }],
    });
    expect(layout.days[2]!.workingBlocks).toEqual([{ startMinute: 540, endMinute: 1020 }]);
    expect(layout.days[3]!.workingBlocks).toEqual([]);
  });
});
