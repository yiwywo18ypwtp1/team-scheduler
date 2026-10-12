import { describe, expect, it } from "vitest";
import { makeEvent } from "@/test/factories";
import { buildAgendaRows } from "./agenda";

describe("buildAgendaRows", () => {
  const days = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"];
  const events = [
    makeEvent({ id: "late", start: "2026-10-12T15:00:00Z", end: "2026-10-12T16:00:00Z" }),
    makeEvent({ id: "early", start: "2026-10-12T09:00:00Z", end: "2026-10-12T10:00:00Z" }),
    makeEvent({ id: "trip", start: "2026-10-13T00:00:00Z", end: "2026-10-15T00:00:00Z", allDay: true }),
  ];

  it("groups events under day headers, all-day first, then by start; skips empty days", () => {
    const rows = buildAgendaRows(events, days, "UTC");
    expect(rows.map((row) => (row.kind === "event" ? `${row.date} ${row.event.id}` : `${row.kind} ${row.date}`))).toEqual([
      "day 2026-10-12",
      "2026-10-12 early",
      "2026-10-12 late",
      "day 2026-10-13",
      "2026-10-13 trip",
      "day 2026-10-14",
      "2026-10-14 trip",
    ]);
  });

  it("keeps selected empty days with a placeholder row", () => {
    const rows = buildAgendaRows([], days, "UTC", ["2026-10-15"]);
    expect(rows.map((row) => row.kind)).toEqual(["day", "empty"]);
  });

  it("uses unique keys even when an event spans several days", () => {
    const keys = buildAgendaRows(events, days, "UTC").map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
