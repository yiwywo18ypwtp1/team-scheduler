import { describe, expect, it } from "vitest";
import { buildIcs } from "@/features/booking/lib/ics";
import { parseIcs } from "./ics-import";

const options = { timeZone: "Europe/Kyiv", attendeeId: "mem_01" };
const ics = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR\r\n`;

describe("parseIcs", () => {
  it("reads UTC, TZID and all-day events", () => {
    const { events, skipped } = parseIcs(
      ics(
        [
          "BEGIN:VEVENT", "SUMMARY:UTC call", "DTSTART:20261020T070000Z", "DTEND:20261020T080000Z", "END:VEVENT",
          "BEGIN:VEVENT", "SUMMARY:NY lunch", "DTSTART;TZID=America/New_York:20261020T120000", "DURATION:PT1H30M", "END:VEVENT",
          "BEGIN:VEVENT", "SUMMARY:Holiday", "DTSTART;VALUE=DATE:20261024", "DTEND;VALUE=DATE:20261026", "END:VEVENT",
        ].join("\r\n"),
      ),
      options,
    );
    expect(skipped).toEqual([]);
    expect(events.map((event) => event.values)).toMatchObject([
      { title: "UTC call", startDate: "2026-10-20", startTime: "10:00", endTime: "11:00", timezone: "Europe/Kyiv", allDay: false },
      { title: "NY lunch", startTime: "12:00", endTime: "13:30", timezone: "America/New_York" },
      { title: "Holiday", allDay: true, startDate: "2026-10-24", endDate: "2026-10-25" },
    ]);
  });

  it("unfolds long lines, unescapes text and keeps the repeat rule", () => {
    const { events } = parseIcs(
      ics(
        [
          "BEGIN:VEVENT",
          "SUMMARY:Standup\\, daily",
          "DESCRIPTION:Line 1\\nLine 2 that is long enough to be fol",
          " ded over two lines",
          "DTSTART;TZID=Europe/Kyiv:20261019T093000",
          "DTEND;TZID=Europe/Kyiv:20261019T094500",
          "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      options,
    );
    expect(events[0]?.values).toMatchObject({
      title: "Standup, daily",
      description: "Line 1\nLine 2 that is long enough to be folded over two lines",
      recurrence: { freq: "weekly", weekdays: [1, 3], end: "count", count: 6 },
    });
  });

  it("skips unreadable events with a reason and imports the rest", () => {
    const { events, skipped } = parseIcs(
      ics(["BEGIN:VEVENT", "SUMMARY:Broken", "DTSTART:tomorrow", "END:VEVENT", "BEGIN:VEVENT", "SUMMARY:Fine", "DTSTART:20261020T070000Z", "END:VEVENT"].join("\r\n")),
      options,
    );
    expect(skipped).toEqual(["Broken: missing or unreadable start (DTSTART)"]);
    expect(events.map((event) => event.values.endTime)).toEqual(["11:00"]); // default 1 hour
  });

  it("reads files produced by our own .ics export", () => {
    const exported = buildIcs({
      uid: "x",
      start: Date.parse("2026-10-20T13:00:00Z"),
      end: Date.parse("2026-10-20T13:30:00Z"),
      createdAt: 0,
      summary: "Intro call; with Maria",
      description: "Topic: Pricing",
    });
    expect(parseIcs(exported, options).events[0]?.values).toMatchObject({
      title: "Intro call; with Maria",
      description: "Topic: Pricing",
      startTime: "16:00",
      endTime: "16:30",
    });
  });
});
