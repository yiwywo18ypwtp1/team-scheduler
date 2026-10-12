import { describe, expect, it } from "vitest";
import { layoutOverlappingEvents, type TimedItem } from "./layout-overlaps";

// Minutes are enough here: the algorithm only compares numbers.
const item = (id: string, start: number, end: number): TimedItem => ({ id, start, end });

function layout(items: TimedItem[]) {
  return Object.fromEntries(layoutOverlappingEvents(items));
}

describe("layoutOverlappingEvents", () => {
  it("gives non-overlapping events the full width", () => {
    expect(layout([item("a", 0, 60), item("b", 60, 120), item("c", 180, 240)])).toEqual({
      a: { column: 0, columnCount: 1 },
      b: { column: 0, columnCount: 1 },
      c: { column: 0, columnCount: 1 },
    });
  });

  it("puts two overlapping events side by side", () => {
    expect(layout([item("a", 0, 60), item("b", 30, 90)])).toEqual({
      a: { column: 0, columnCount: 2 },
      b: { column: 1, columnCount: 2 },
    });
  });

  it("reuses a freed column inside a chained cluster", () => {
    // a overlaps b, b overlaps c, but a and c don't: 2 columns for all three.
    expect(layout([item("a", 0, 60), item("b", 30, 120), item("c", 60, 90)])).toEqual({
      a: { column: 0, columnCount: 2 },
      b: { column: 1, columnCount: 2 },
      c: { column: 0, columnCount: 2 },
    });
  });

  it("puts the longer event first when start times are equal", () => {
    expect(layout([item("short", 0, 30), item("long", 0, 120)])).toEqual({
      long: { column: 0, columnCount: 2 },
      short: { column: 1, columnCount: 2 },
    });
  });

  it("sizes each cluster independently", () => {
    const result = layout([
      item("a", 0, 60),
      item("b", 0, 60),
      item("c", 0, 60),
      item("d", 120, 180),
    ]);
    expect(result.c).toEqual({ column: 2, columnCount: 3 });
    expect(result.d).toEqual({ column: 0, columnCount: 1 });
  });

  it("handles nested events", () => {
    expect(layout([item("outer", 0, 240), item("inner1", 30, 60), item("inner2", 90, 120)])).toEqual({
      outer: { column: 0, columnCount: 2 },
      inner1: { column: 1, columnCount: 2 },
      inner2: { column: 1, columnCount: 2 },
    });
  });

  it("does not depend on input order", () => {
    const items = [item("a", 0, 60), item("b", 30, 120), item("c", 60, 90), item("d", 45, 50)];
    const expected = layout(items);
    expect(layout([...items].reverse())).toEqual(expected);
    expect(layout([items[2]!, items[0]!, items[3]!, items[1]!])).toEqual(expected);
  });

  it("never places overlapping events in the same column", () => {
    const items = Array.from({ length: 200 }, (_, index) => {
      const start = (index * 37) % 1380;
      return item(`e${index}`, start, start + 15 + ((index * 13) % 90));
    });
    const result = layoutOverlappingEvents(items);

    for (const a of items) {
      for (const b of items) {
        if (a.id >= b.id || a.end <= b.start || b.end <= a.start) continue;
        expect(result.get(a.id)?.column).not.toBe(result.get(b.id)?.column);
        expect(result.get(a.id)?.columnCount).toBe(result.get(b.id)?.columnCount);
      }
    }
  });
});
