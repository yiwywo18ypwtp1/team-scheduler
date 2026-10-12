import { describe, expect, it } from "vitest";
import { dropPosition } from "./drag";

// 7 columns of 100 px; 1 px per minute keeps the numbers readable.
const base = {
  width: 700,
  dayMinutes: [1440, 1440, 1440, 1440, 1440, 1440, 1500],
  grabOffsetMinutes: 0,
  durationMinutes: 60,
  minuteHeightPx: 1,
};

describe("dropPosition", () => {
  it("maps the pointer to a day column and a snapped start", () => {
    expect(dropPosition({ ...base, x: 250, y: 607 })).toEqual({ dayIndex: 2, startMinute: 600 });
    expect(dropPosition({ ...base, x: 250, y: 608 })).toEqual({ dayIndex: 2, startMinute: 615 });
  });

  it("keeps the grab offset, so the event doesn't jump to the cursor", () => {
    expect(dropPosition({ ...base, x: 50, y: 640, grabOffsetMinutes: 40 })).toEqual({
      dayIndex: 0,
      startMinute: 600,
    });
  });

  it("clamps to the visible days", () => {
    expect(dropPosition({ ...base, x: -30, y: 600 }).dayIndex).toBe(0);
    expect(dropPosition({ ...base, x: 900, y: 600 }).dayIndex).toBe(6);
  });

  it("keeps at least 15 minutes of the event inside the target day", () => {
    expect(dropPosition({ ...base, x: 50, y: 2000 }).startMinute).toBe(1425);
    expect(dropPosition({ ...base, x: 50, y: -500 }).startMinute).toBe(-45);
  });

  it("uses the real length of a 25-hour DST day", () => {
    expect(dropPosition({ ...base, x: 650, y: 2000 }).startMinute).toBe(1485);
  });
});
