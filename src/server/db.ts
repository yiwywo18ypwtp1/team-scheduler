import "server-only";
import { getNow } from "@/lib/time/now";
import type { BookingPage, CalendarEvent, Member, Room } from "@/types/domain";
import { createSeedData } from "./seed";

/**
 * In-memory mock database. Plain collections, no query layer: feature modules
 * in `server/` read and write them directly.
 *
 * Data lives as long as the server process and resets on restart. That is
 * fine for a mock, but it only works with a single server instance.
 */
export type Db = {
  members: Member[];
  rooms: Room[];
  events: Map<string, CalendarEvent>;
  bookingPages: Map<string, BookingPage>;
};

function createDb(): Db {
  const seed = createSeedData(getNow());
  return {
    members: seed.members,
    rooms: seed.rooms,
    events: new Map(seed.events.map((event) => [event.id, event])),
    bookingPages: new Map(seed.bookingPages.map((page) => [page.slug, page])),
  };
}

// Stored on globalThis so dev-mode hot reloads reuse the same data
// instead of re-seeding (and losing edits) on every file change.
const globalForDb = globalThis as typeof globalThis & { teamSchedulerDb?: Db };

export const db: Db = (globalForDb.teamSchedulerDb ??= createDb());
