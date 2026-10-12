import { describe, expect, it } from "vitest";
import { buildIcs } from "./ics";

const base = {
  uid: "bkg_1@team-scheduler",
  start: Date.parse("2026-10-20T13:00:00Z"),
  end: Date.parse("2026-10-20T13:30:00Z"),
  createdAt: Date.parse("2026-10-12T09:15:30Z"),
  summary: "Intro call",
};

describe("buildIcs", () => {
  it("writes a VEVENT with UTC times and CRLF line endings", () => {
    const ics = buildIcs(base);
    expect(ics).toContain("\r\nDTSTART:20261020T130000Z\r\n");
    expect(ics).toContain("\r\nDTEND:20261020T133000Z\r\n");
    expect(ics).toContain("\r\nDTSTAMP:20261012T091530Z\r\n");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("escapes text values", () => {
    const ics = buildIcs({ ...base, summary: "Call; agenda, notes\\", description: "Line 1\nLine 2" });
    expect(ics).toContain("SUMMARY:Call\\; agenda\\, notes\\\\");
    expect(ics).toContain("DESCRIPTION:Line 1\\nLine 2");
  });

  it("folds long lines at 75 octets, counting multi-byte characters", () => {
    const ics = buildIcs({ ...base, description: "Дуже довгий опис зустрічі ".repeat(10) });
    for (const line of ics.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    // Unfolding (removing CRLF + space) restores the original line.
    expect(ics.replace(/\r\n /g, "")).toContain(`DESCRIPTION:${"Дуже довгий опис зустрічі ".repeat(10)}`);
  });
});
