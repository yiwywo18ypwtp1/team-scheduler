import { describe, expect, it } from "vitest";
import { assignLanes } from "./layout-lanes";

const span = (id: string, startIndex: number, endIndex: number) => ({ id, startIndex, endIndex });

describe("assignLanes", () => {
  it("stacks overlapping bars and reuses free lanes", () => {
    const lanes = assignLanes([span("a", 0, 3), span("b", 1, 2), span("c", 3, 5), span("d", 2, 4)]);
    expect(Object.fromEntries(lanes)).toEqual({ a: 0, b: 1, d: 1, c: 0 });
  });

  it("puts longer bars first when they start on the same day", () => {
    const lanes = assignLanes([span("single", 0, 1), span("multi", 0, 3)]);
    expect(lanes.get("multi")).toBe(0);
    expect(lanes.get("single")).toBe(1);
  });

  it("keeps the caller's order on full ties", () => {
    const lanes = assignLanes([span("first", 2, 3), span("second", 2, 3)]);
    expect(lanes.get("first")).toBe(0);
    expect(lanes.get("second")).toBe(1);
  });
});
