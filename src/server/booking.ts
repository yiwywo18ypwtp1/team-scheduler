import "server-only";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  bookableWindow,
  computeSlots,
  nearestSlots,
} from "@/features/booking/lib/slots";
import { bookingRequestSchema } from "@/features/booking/schema";
import { busyIntervalsFor } from "@/lib/availability";
import { DomainError, validationError } from "@/lib/errors";
import { intersectIntervals, type Interval } from "@/lib/intervals";
import { workingIntervals } from "@/lib/time/working-hours";
import {
  addDaysToDateKey,
  dateKeyInTimeZone,
  dayIntervalInTimeZone,
  parseIsoWithOffset,
  toZonedIso,
  type DateKey,
} from "@/lib/time/zoned";
import type { Booking, BookingPage, CalendarEvent, Member } from "@/types/domain";
import { bookingFromRow, getDb, insertBooking, insertEvent, type BookingRow } from "./db";
import { listEvents } from "./events";
import { getMember } from "./members";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 31;
const ALTERNATIVES_COUNT = 5;

export function listBookingPages(): BookingPage[] {
  const rows = getDb().prepare("SELECT data FROM booking_pages ORDER BY slug").all() as { data: string }[];
  return rows.map((row) => JSON.parse(row.data) as BookingPage);
}

export function getBookingPage(slug: string): BookingPage | undefined {
  const row = getDb().prepare("SELECT data FROM booking_pages WHERE slug = ?").get(slug) as
    | { data: string }
    | undefined;
  return row && (JSON.parse(row.data) as BookingPage);
}

function requirePage(slug: string): { page: BookingPage; owner: Member } {
  const page = getBookingPage(slug);
  if (!page) throw new DomainError("NOT_FOUND", "This booking page doesn't exist");
  const owner = getMember(page.ownerId);
  if (!owner) throw new DomainError("NOT_FOUND", "The owner of this booking page no longer exists");
  return { page, owner };
}

function assertDuration(page: BookingPage, durationMinutes: number) {
  if (!page.durationOptions.includes(durationMinutes)) {
    throw new DomainError("VALIDATION_ERROR", "Some fields are invalid", {
      duration: [`Choose one of: ${page.durationOptions.join(", ")} minutes`],
    });
  }
}

/** Free slots of the page owner within `range`, honouring buffers, minNotice and horizon. */
function slotsInRange(page: BookingPage, owner: Member, range: Interval, durationMinutes: number, now: number) {
  const window = bookableWindow({ now, minNoticeMinutes: page.minNotice, horizonDays: page.horizonDays });
  const [clipped] = intersectIntervals([range], [window]);
  if (!clipped) return [];

  // Events just outside the range still matter because of the buffers.
  const events = listEvents({ start: clipped.start - DAY_MS, end: clipped.end + DAY_MS, memberIds: [owner.id] });
  return computeSlots({
    working: workingIntervals(owner.workingHours, owner.timezone, clipped),
    busy: busyIntervalsFor(events, owner.id),
    durationMinutes,
    bufferBeforeMinutes: page.bufferBefore,
    bufferAfterMinutes: page.bufferAfter,
  });
}

/**
 * Slots for the days `from`..`to` (inclusive) as seen in the guest's timezone.
 * Without `from`, starts today: the server's "now" (MOCK_NOW-aware) decides
 * what today is, not the visitor's clock.
 */
export function getSlots(
  slug: string,
  { from, to, timeZone, durationMinutes, now }: { from?: DateKey; to?: DateKey; timeZone: string; durationMinutes: number; now: number },
) {
  const { page, owner } = requirePage(slug);
  assertDuration(page, durationMinutes);

  const window = bookableWindow({ now, minNoticeMinutes: page.minNotice, horizonDays: page.horizonDays });
  const firstDate = dateKeyInTimeZone(now, timeZone);
  const lastDate = dateKeyInTimeZone(window.end - 1, timeZone);

  // Nothing before today can be booked, so the range never starts in the past.
  const start = from && from > firstDate ? from : firstDate;
  const end = to ?? addDaysToDateKey(start, 6);
  if (end < start || end > addDaysToDateKey(start, MAX_RANGE_DAYS - 1)) {
    throw new DomainError("VALIDATION_ERROR", "Some fields are invalid", {
      to: [`Choose a range of 1 to ${MAX_RANGE_DAYS} days`],
    });
  }

  const range = {
    start: dayIntervalInTimeZone(start, timeZone).start,
    end: dayIntervalInTimeZone(end, timeZone).end,
  };
  return {
    from: start,
    to: end,
    firstDate,
    lastDate,
    slots: slotsInRange(page, owner, range, durationMinutes, now),
  };
}

/**
 * Books a slot. The availability check and the inserts run in one IMMEDIATE
 * transaction: SQLite takes the write lock first, so two guests racing for
 * the same slot are serialized and the second one gets SLOT_TAKEN.
 */
export function createBooking(slug: string, raw: unknown, now: number): Booking {
  const parsed = bookingRequestSchema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error);
  const request = parsed.data;

  const { page, owner } = requirePage(slug);
  assertDuration(page, request.duration);
  const start = parseIsoWithOffset(request.start) as number; // validated by the schema
  const end = start + request.duration * 60 * 1000;

  const db = getDb();
  return db
    .transaction(() => {
      const window = bookableWindow({ now, minNoticeMinutes: page.minNotice, horizonDays: page.horizonDays });
      const available = slotsInRange(page, owner, window, request.duration, now);

      if (!available.some((slot) => slot.start === start)) {
        throw new DomainError("SLOT_TAKEN", "Sorry, this time is no longer available.", undefined, {
          alternatives: nearestSlots(available, start, ALTERNATIVES_COUNT).map((slot) => ({
            start: new Date(slot.start).toISOString(),
            end: new Date(slot.end).toISOString(),
          })),
        });
      }

      const { name, email, notes } = request.answers;
      const event: CalendarEvent = {
        id: `evt_${randomUUID()}`,
        title: `${page.title}: ${name}`,
        description: [`Booked by ${name} <${email}>`, notes].filter(Boolean).join("\n\n"),
        start: toZonedIso(start, owner.timezone),
        end: toZonedIso(end, owner.timezone),
        timezone: owner.timezone,
        allDay: false,
        attendees: [{ memberId: owner.id, status: "accepted" }],
        version: 1,
      };
      const booking: Booking = {
        id: `bkg_${randomUUID()}`,
        slug,
        eventId: event.id,
        start: event.start,
        end: event.end,
        guestTimeZone: request.guestTimeZone,
        answers: { name, email, notes },
        status: "confirmed",
        createdAt: new Date(now).toISOString(),
        cancelToken: randomBytes(24).toString("base64url"),
      };

      insertEvent(db, event);
      insertBooking(db, booking);
      return booking;
    })
    .immediate();
}

function tokensMatch(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  // Constant-time comparison, so the token can't be guessed byte by byte from response times.
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The booking, only for whoever holds its secret token (the guest's links). */
export function getBookingForGuest(id: string, token: string): Booking | undefined {
  const row = getDb().prepare("SELECT * FROM bookings WHERE id = ?").get(id) as BookingRow | undefined;
  const booking = row && bookingFromRow(row);
  return booking && tokensMatch(booking.cancelToken, token) ? booking : undefined;
}

/** Cancels the booking and frees the owner's time. Cancelling twice is a no-op. */
export function cancelBooking(id: string, token: string): Booking {
  const db = getDb();
  return db.transaction(() => {
    const booking = getBookingForGuest(id, token);
    if (!booking) throw new DomainError("NOT_FOUND", "Booking not found");
    if (booking.status === "cancelled") return booking;

    db.prepare("DELETE FROM events WHERE id = ?").run(booking.eventId);
    db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(id);
    return { ...booking, status: "cancelled" as const };
  })();
}
