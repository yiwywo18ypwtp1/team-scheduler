import { describe, expect, it } from "vitest";
import {
  intersectAllIntervals,
  intersectIntervals,
  mergeIntervals,
  subtractIntervals,
  type Interval,
} from "./intervals";

// The maths is unit-agnostic, so small integers keep the cases readable.
const iv = (start: number, end: number): Interval => ({ start, end });

describe("mergeIntervals", () => {
  it("sorts and merges overlapping intervals", () => {
    expect(mergeIntervals([iv(5, 8), iv(1, 3), iv(2, 4)])).toEqual([iv(1, 4), iv(5, 8)]);
  });

  it("merges touching and nested intervals", () => {
    expect(mergeIntervals([iv(1, 2), iv(2, 3)])).toEqual([iv(1, 3)]);
    expect(mergeIntervals([iv(1, 10), iv(3, 4)])).toEqual([iv(1, 10)]);
  });

  it("drops empty and inverted intervals", () => {
    expect(mergeIntervals([iv(5, 5), iv(7, 6), iv(1, 2)])).toEqual([iv(1, 2)]);
  });

  it("does not mutate the input", () => {
    const input = [iv(2, 4), iv(1, 3)];
    mergeIntervals(input);
    expect(input).toEqual([iv(2, 4), iv(1, 3)]);
  });
});

describe("subtractIntervals", () => {
  it("splits an interval around a removed middle part", () => {
    expect(subtractIntervals([iv(0, 10)], [iv(3, 5)])).toEqual([iv(0, 3), iv(5, 10)]);
  });

  it("trims edges and handles several unsorted removals", () => {
    expect(subtractIntervals([iv(0, 10)], [iv(8, 12), iv(-2, 1), iv(4, 5)])).toEqual([
      iv(1, 4),
      iv(5, 8),
    ]);
  });

  it("returns nothing when fully covered", () => {
    expect(subtractIntervals([iv(2, 4)], [iv(0, 10)])).toEqual([]);
  });

  it("keeps intervals untouched by removals", () => {
    expect(subtractIntervals([iv(0, 2), iv(5, 6)], [iv(3, 4)])).toEqual([iv(0, 2), iv(5, 6)]);
  });
});

describe("intersectIntervals", () => {
  it("returns the common parts of two lists", () => {
    expect(intersectIntervals([iv(0, 5), iv(8, 12)], [iv(3, 10)])).toEqual([
      iv(3, 5),
      iv(8, 10),
    ]);
  });

  it("treats touching intervals as not overlapping", () => {
    expect(intersectIntervals([iv(0, 2)], [iv(2, 4)])).toEqual([]);
  });

  it("returns nothing when one side is empty", () => {
    expect(intersectIntervals([iv(0, 2)], [])).toEqual([]);
  });
});

describe("intersectAllIntervals", () => {
  it("returns time common to every list", () => {
    expect(
      intersectAllIntervals([
        [iv(0, 10)],
        [iv(2, 6), iv(7, 9)],
        [iv(5, 8)],
      ]),
    ).toEqual([iv(5, 6), iv(7, 8)]);
  });

  it("returns the merged list for a single list and nothing for no lists", () => {
    expect(intersectAllIntervals([[iv(2, 3), iv(1, 2)]])).toEqual([iv(1, 3)]);
    expect(intersectAllIntervals([])).toEqual([]);
  });
});
