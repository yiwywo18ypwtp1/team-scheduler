import { describe, expect, it } from "vitest";
import { makeEvent } from "@/test/factories";
import { buildMonthLayout, monthDayEvents } from "./month-layout";
import { visibleDays } from "./range";

const TZ = "UTC";
const days = visibleDays("month", "2026-10-01"); // Sep 28 .. Nov 1, 5 weeks

const timed = (id: string, date: string, hour: number) =>
  makeEvent({
    id,
    start: `${date}T${String(hour).padStart(2, "0")}:00:00Z`,
    end: `${date}T${String(hour + 1).padStart(2, "0")}:00:00Z`,
  });

describe("buildMonthLayout", () => {
  it("splits the grid into week rows", () => {
    const weeks = buildMonthLayout({ events: [], days, timeZone: TZ });
    expect(weeks).toHaveLength(5);
    expect(weeks[0]!.days[0]).toBe("2026-09-28");
  });

  it("hides events beyond the visible lanes and counts them per day", () => {
    const events = [9, 10, 11, 12, 13].map((hour) => timed(`e${hour}`, "2026-10-14", hour));
    const week = buildMonthLayout({ events, days, timeZone: TZ, visibleLanes: 3 })[2]!;

    expect(week.bars.map((bar) => bar.event.id)).toEqual(["e9", "e10", "e11"]);
    expect(week.hiddenCounts).toEqual([0, 0, 2, 0, 0, 0, 0]);
  });

  it("lists a day's events for the popover like the cell orders them", () => {
    const lateNight = makeEvent({ id: "late", start: "2026-10-14T00:30:00Z", end: "2026-10-14T01:30:00Z" });
    // Crosses midnight: a short timed event shows on its start day only.
    const previousNight = makeEvent({ id: "prev", start: "2026-10-13T23:30:00Z", end: "2026-10-14T00:30:00Z" });
    const allDay = makeEvent({ id: "all", start: "2026-10-14T00:00:00Z", end: "2026-10-15T00:00:00Z", allDay: true });
    const events = [timed("e10", "2026-10-14", 10), previousNight, lateNight, allDay];
    expect(monthDayEvents(events, "2026-10-14", TZ).map((event) => event.id)).toEqual(["all", "late", "e10"]);
  });

  it("splits a multi-day bar across week rows and keeps it in the top lane", () => {
    const trip = makeEvent({
      id: "trip",
      start: "2026-10-09T00:00:00Z",
      end: "2026-10-14T00:00:00Z",
      allDay: true,
    });
    const weeks = buildMonthLayout({
      events: [timed("before", "2026-10-09", 9), trip],
      days,
      timeZone: TZ,
    });

    expect(weeks[1]!.bars).toMatchObject([
      { event: { id: "trip" }, startIndex: 4, endIndex: 7, lane: 0 },
      { event: { id: "before" }, startIndex: 4, endIndex: 5, lane: 1 },
    ]);
    expect(weeks[2]!.bars).toMatchObject([{ event: { id: "trip" }, startIndex: 0, endIndex: 2 }]);
  });

  it("shows a short event crossing midnight on its start day only", () => {
    const late = makeEvent({ id: "late", start: "2026-10-14T23:00:00Z", end: "2026-10-15T01:00:00Z" });
    const week = buildMonthLayout({ events: [late], days, timeZone: TZ })[2]!;
    expect(week.bars).toMatchObject([{ startIndex: 2, endIndex: 3 }]);
  });
});
