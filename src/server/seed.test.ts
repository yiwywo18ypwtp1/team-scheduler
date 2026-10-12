import { describe, expect, it } from "vitest";
import { TIME_ZONE_OPTIONS } from "@/lib/time/time-zones";
import { isValidTimeZone } from "@/lib/time/zoned";
import { createSeedData, SEED_TIME_ZONES } from "./seed";

const NOW = Date.parse("2026-10-12T09:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const seed = createSeedData(NOW);

describe("createSeedData", () => {
  it("matches the sizes from the spec", () => {
    expect(seed.members).toHaveLength(30);
    expect(new Set(seed.members.map((member) => member.timezone)).size).toBe(8);
    expect(seed.rooms).toHaveLength(5);
    expect(seed.events).toHaveLength(5000);
    expect(seed.bookingPages.length).toBeGreaterThan(0);
  });

  it("is deterministic for the same day", () => {
    expect(createSeedData(NOW + 60 * 60 * 1000)).toEqual(seed);
  });

  it("produces valid events", () => {
    const memberIds = new Set(seed.members.map((member) => member.id));
    const rooms = new Map(seed.rooms.map((room) => [room.id, room]));

    for (const event of seed.events) {
      const start = Date.parse(event.start);
      const end = Date.parse(event.end);
      expect(end, event.id).toBeGreaterThan(start);
      expect(Math.abs(start - NOW), event.id).toBeLessThanOrEqual(91 * DAY_MS);
      expect(event.attendees.length, event.id).toBeGreaterThan(0);
      for (const attendee of event.attendees) {
        expect(memberIds.has(attendee.memberId), event.id).toBe(true);
      }
      if (event.location?.kind === "room") {
        const room = rooms.get(event.location.roomId);
        expect(room?.capacity, event.id).toBeGreaterThanOrEqual(event.attendees.length);
      }
    }
  });

  it("has unique ids", () => {
    expect(new Set(seed.events.map((event) => event.id)).size).toBe(seed.events.length);
  });

  it("only references existing members as booking page owners", () => {
    const memberIds = new Set(seed.members.map((member) => member.id));
    for (const page of seed.bookingPages) {
      expect(memberIds.has(page.ownerId)).toBe(true);
    }
  });
});

describe("TIME_ZONE_OPTIONS", () => {
  it("are all valid and include every seed timezone", () => {
    for (const timeZone of TIME_ZONE_OPTIONS) expect(isValidTimeZone(timeZone)).toBe(true);
    for (const timeZone of SEED_TIME_ZONES) expect(TIME_ZONE_OPTIONS).toContain(timeZone);
  });
});
