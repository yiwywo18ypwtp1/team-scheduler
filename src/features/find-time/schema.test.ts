import { describe, expect, it } from "vitest";
import {
  findTimeInputFromSearchParams,
  findTimeSchema,
  findTimeSearchParams,
  searchRange,
  type FindTimeQuery,
} from "./schema";

const valid: FindTimeQuery = {
  memberIds: ["mem_01", "mem_07"],
  from: "2026-10-19",
  to: "2026-10-23",
  tz: "Europe/Kyiv",
  duration: 60,
};

function errorsOf(input: unknown) {
  const result = findTimeSchema.safeParse(input);
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((issue) => [issue.path.join("."), issue.message]));
}

describe("findTimeSchema", () => {
  it("accepts a valid query", () => {
    expect(errorsOf(valid)).toEqual({});
  });

  it("validates people, duration and the date range", () => {
    expect(errorsOf({ ...valid, memberIds: [] })).toEqual({ memberIds: "Choose at least one person" });
    expect(errorsOf({ ...valid, duration: 50 })).toEqual({ duration: "Use 15-minute steps" });
    expect(errorsOf({ ...valid, to: "2026-10-18" })).toEqual({ to: "End date must not be before start date" });
    expect(errorsOf({ ...valid, to: "2026-11-02" })).toEqual({ to: "Search up to 14 days at a time" });
    expect(errorsOf({ ...valid, to: "2026-11-01" })).toEqual({});
  });
});

describe("URL round trip", () => {
  it("encodes and decodes a query", () => {
    const withRoom = { ...valid, roomId: "room_2" };
    const raw = Object.fromEntries(new URLSearchParams(findTimeSearchParams(withRoom)));
    expect(findTimeSchema.parse(findTimeInputFromSearchParams(raw))).toEqual(withRoom);
  });

  it("turns missing values into schema errors instead of crashing", () => {
    expect(Object.keys(errorsOf(findTimeInputFromSearchParams({ members: "mem_01" })))).toEqual(
      expect.arrayContaining(["from", "to", "tz", "duration"]),
    );
  });
});

describe("searchRange", () => {
  it("covers whole local days in the chosen timezone", () => {
    expect(searchRange(valid)).toEqual({
      start: Date.parse("2026-10-18T21:00:00Z"),
      end: Date.parse("2026-10-23T21:00:00Z"),
    });
  });
});
