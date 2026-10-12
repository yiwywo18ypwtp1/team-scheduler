import "server-only";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { getNow } from "@/lib/time/now";
import type {
  Attendee,
  AttendeeStatus,
  Booking,
  BookingPage,
  CalendarEvent,
  Member,
  Room,
  WorkingHours,
} from "@/types/domain";
import { createSeedData } from "./seed";

/**
 * SQLite persistence: connection, schema and row <-> domain mapping.
 * Feature modules in `server/` write their queries against `getDb()` and use
 * the mappers below, so SQL column names never leak past this layer.
 *
 * No ORM or migration tool: the schema is small and created on startup.
 * After a schema change during development, run `npm run db:reset`.
 */
export type Db = Database.Database;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS members (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL,
    timezone      TEXT NOT NULL,
    avatar_url    TEXT,
    working_hours TEXT NOT NULL -- JSON WorkingHours[], never queried by field
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id       TEXT PRIMARY KEY,
    name     TEXT NOT NULL,
    capacity INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id               TEXT PRIMARY KEY,
    series_id        TEXT,
    title            TEXT NOT NULL,
    description      TEXT,
    starts_at        TEXT NOT NULL,    -- ISO with offset, as in the API
    ends_at          TEXT NOT NULL,
    start_ms         INTEGER NOT NULL, -- same instants as UTC epoch ms, for range queries
    end_ms           INTEGER NOT NULL,
    timezone         TEXT NOT NULL,
    all_day          INTEGER NOT NULL,
    rrule            TEXT,
    exdates          TEXT,             -- JSON string[]
    location_kind    TEXT,             -- 'room' | 'url' | NULL
    location_room_id TEXT REFERENCES rooms(id),
    location_url     TEXT,
    version          INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS events_by_start ON events (start_ms);

  CREATE TABLE IF NOT EXISTS event_attendees (
    event_id  TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    member_id TEXT NOT NULL REFERENCES members(id),
    status    TEXT NOT NULL,
    PRIMARY KEY (event_id, member_id)
  );
  CREATE INDEX IF NOT EXISTS event_attendees_by_member ON event_attendees (member_id);

  -- A booking page is a config document read and written as a whole.
  CREATE TABLE IF NOT EXISTS booking_pages (
    slug TEXT PRIMARY KEY,
    data TEXT NOT NULL -- JSON BookingPage
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id              TEXT PRIMARY KEY,
    slug            TEXT NOT NULL REFERENCES booking_pages(slug),
    event_id        TEXT NOT NULL, -- no FK: the event is deleted on cancel, the booking stays
    starts_at       TEXT NOT NULL,
    ends_at         TEXT NOT NULL,
    guest_time_zone TEXT NOT NULL,
    answers         TEXT NOT NULL, -- JSON
    status          TEXT NOT NULL, -- 'confirmed' | 'cancelled'
    created_at      TEXT NOT NULL,
    cancel_token    TEXT NOT NULL
  );
`;

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

export type MemberRow = {
  id: string;
  name: string;
  email: string;
  timezone: string;
  avatar_url: string | null;
  working_hours: string;
};

export function memberFromRow(row: MemberRow): Member {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    timezone: row.timezone,
    avatarUrl: row.avatar_url ?? undefined,
    workingHours: JSON.parse(row.working_hours) as WorkingHours[],
  };
}

export type EventRow = {
  id: string;
  series_id: string | null;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  all_day: 0 | 1;
  rrule: string | null;
  exdates: string | null;
  location_kind: "room" | "url" | null;
  location_room_id: string | null;
  location_url: string | null;
  version: number;
};

export type AttendeeRow = { event_id: string; member_id: string; status: AttendeeStatus };

export function eventFromRow(row: EventRow, attendees: Attendee[]): CalendarEvent {
  const location: CalendarEvent["location"] =
    row.location_kind === "room" && row.location_room_id
      ? { kind: "room", roomId: row.location_room_id }
      : row.location_kind === "url" && row.location_url
        ? { kind: "url", url: row.location_url }
        : undefined;

  return {
    id: row.id,
    seriesId: row.series_id ?? undefined,
    title: row.title,
    description: row.description ?? undefined,
    start: row.starts_at,
    end: row.ends_at,
    timezone: row.timezone,
    allDay: row.all_day === 1,
    rrule: row.rrule ?? undefined,
    exdates: row.exdates ? (JSON.parse(row.exdates) as string[]) : undefined,
    attendees,
    location,
    version: row.version,
  };
}

/** Inserts an event together with its attendees. Call inside a transaction. */
export function insertEvent(db: Db, event: CalendarEvent) {
  db.prepare(
    `INSERT INTO events (id, series_id, title, description, starts_at, ends_at, start_ms, end_ms,
       timezone, all_day, rrule, exdates, location_kind, location_room_id, location_url, version)
     VALUES (@id, @seriesId, @title, @description, @start, @end, @startMs, @endMs,
       @timezone, @allDay, @rrule, @exdates, @locationKind, @locationRoomId, @locationUrl, @version)`,
  ).run({
    id: event.id,
    seriesId: event.seriesId ?? null,
    title: event.title,
    description: event.description ?? null,
    start: event.start,
    end: event.end,
    startMs: Date.parse(event.start),
    endMs: Date.parse(event.end),
    timezone: event.timezone,
    allDay: event.allDay ? 1 : 0,
    rrule: event.rrule ?? null,
    exdates: event.exdates ? JSON.stringify(event.exdates) : null,
    locationKind: event.location?.kind ?? null,
    locationRoomId: event.location?.kind === "room" ? event.location.roomId : null,
    locationUrl: event.location?.kind === "url" ? event.location.url : null,
    version: event.version,
  });

  const insertAttendee = db.prepare(
    "INSERT INTO event_attendees (event_id, member_id, status) VALUES (?, ?, ?)",
  );
  for (const attendee of event.attendees) {
    insertAttendee.run(event.id, attendee.memberId, attendee.status);
  }
}

export type BookingRow = {
  id: string;
  slug: string;
  event_id: string;
  starts_at: string;
  ends_at: string;
  guest_time_zone: string;
  answers: string;
  status: Booking["status"];
  created_at: string;
  cancel_token: string;
};

export function bookingFromRow(row: BookingRow): Booking {
  return {
    id: row.id,
    slug: row.slug,
    eventId: row.event_id,
    start: row.starts_at,
    end: row.ends_at,
    guestTimeZone: row.guest_time_zone,
    answers: JSON.parse(row.answers) as Booking["answers"],
    status: row.status,
    createdAt: row.created_at,
    cancelToken: row.cancel_token,
  };
}

export function insertBooking(db: Db, booking: Booking) {
  db.prepare(
    `INSERT INTO bookings (id, slug, event_id, starts_at, ends_at, guest_time_zone, answers, status, created_at, cancel_token)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    booking.id,
    booking.slug,
    booking.eventId,
    booking.start,
    booking.end,
    booking.guestTimeZone,
    JSON.stringify(booking.answers),
    booking.status,
    booking.createdAt,
    booking.cancelToken,
  );
}

// ---------------------------------------------------------------------------
// Connection and seeding
// ---------------------------------------------------------------------------

function seed(db: Db, data: ReturnType<typeof createSeedData>) {
  const insertMember = db.prepare(
    "INSERT INTO members (id, name, email, timezone, avatar_url, working_hours) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (const member of data.members) {
    insertMember.run(
      member.id,
      member.name,
      member.email,
      member.timezone,
      member.avatarUrl ?? null,
      JSON.stringify(member.workingHours),
    );
  }

  const insertRoom = db.prepare("INSERT INTO rooms (id, name, capacity) VALUES (?, ?, ?)");
  for (const room of data.rooms satisfies Room[]) {
    insertRoom.run(room.id, room.name, room.capacity);
  }

  for (const event of data.events) insertEvent(db, event);

  const insertPage = db.prepare("INSERT INTO booking_pages (slug, data) VALUES (?, ?)");
  for (const page of data.bookingPages satisfies BookingPage[]) {
    insertPage.run(page.slug, JSON.stringify(page));
  }
}

function openDb(): Db {
  const file = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "scheduler.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const db = new Database(file, { timeout: 10_000 });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // IMMEDIATE takes the write lock up front, so parallel processes
  // (e.g. `next build` workers) wait instead of seeding twice.
  db.transaction(() => {
    db.exec(SCHEMA);
    const { count } = db.prepare("SELECT COUNT(*) AS count FROM members").get() as {
      count: number;
    };
    if (count === 0) seed(db, createSeedData(getNow()));
  }).immediate();

  return db;
}

// One connection per server process, reused across dev-mode hot reloads.
const globalForDb = globalThis as typeof globalThis & { teamSchedulerDb?: Db };

/** Opens the database lazily, so merely importing a module never touches the disk. */
export function getDb(): Db {
  return (globalForDb.teamSchedulerDb ??= openDb());
}
