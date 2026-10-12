import "server-only";
import { unstable_cache } from "next/cache";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  bookableWindow,
  computeSlots,
  nearestSlots,
} from "@/features/booking/lib/slots";
import { bookingPageSettingsSchema, bookingPageTag } from "@/features/booking/page-schema";
import { formatAnswer, guestIdentity, questionsVersion } from "@/features/booking/answers";
import { makeBookingRequestSchema } from "@/features/booking/schema";
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

/**
 * Page settings for the public, static `/book/[slug]` page (and its metadata
 * and OG image). Cached under the page's tag: PUT /api/booking-pages/:slug
 * revalidates the tag, so the static HTML is rebuilt with the new settings.
 */
export function getPublicBookingPage(slug: string) {
  return unstable_cache(
    async () => {
      const page = getBookingPage(slug);
      if (!page) return null;
      const owner = getMember(page.ownerId);
      return { page, ownerName: owner?.name };
    },
    ["public-booking-page", slug],
    { tags: [bookingPageTag(slug)] },
  )();
}

/** Owner-only update of a booking page's settings (slug and owner stay). */
export function updateBookingPage(slug: string, raw: unknown, actorId: string): BookingPage {
  const page = getBookingPage(slug);
  if (!page) throw new DomainError("NOT_FOUND", "This booking page doesn't exist");
  if (page.ownerId !== actorId) throw new DomainError("FORBIDDEN", "Only the owner can change this booking page");

  const parsed = bookingPageSettingsSchema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error);

  const updated: BookingPage = { ...parsed.data, slug: page.slug, ownerId: page.ownerId };
  getDb().prepare("UPDATE booking_pages SET data = ? WHERE slug = ?").run(JSON.stringify(updated), slug);
  return updated;
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

/** "Label: answer" lines, for the owner's event and the guest's .ics file. */
export function answersText(questions: BookingPage["questions"], answers: Booking["answers"]): string {
  return questions
    .filter((question) => answers[question.id] !== undefined)
    .map((question) => `${question.label}: ${formatAnswer(answers[question.id]!)}`)
    .join("\n");
}

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,200}$/;

function getBookingById(id: string): Booking | undefined {
  const row = getDb().prepare("SELECT * FROM bookings WHERE id = ?").get(id) as BookingRow | undefined;
  return row && bookingFromRow(row);
}

/**
 * Books a slot. The availability check and the inserts run in one IMMEDIATE
 * transaction: SQLite takes the write lock first, so two guests racing for
 * the same slot are serialized and the second one gets SLOT_TAKEN.
 *
 * With an `idempotencyKey`, a repeated request (double click, retry after a
 * timeout) returns the booking the first one created instead of a new one.
 * The key is checked inside the same transaction, so even two simultaneous
 * requests with one key produce one booking.
 */
export function createBooking(
  slug: string,
  raw: unknown,
  now: number,
  idempotencyKey?: string,
): { booking: Booking; replayed: boolean } {
  if (idempotencyKey !== undefined && !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    throw new DomainError("VALIDATION_ERROR", "Some fields are invalid", {
      idempotencyKey: ["Use 8-200 letters, digits, '-' or '_'"],
    });
  }
  const { page, owner } = requirePage(slug);
  // A retry sends the same body, so the raw JSON identifies the request.
  const requestHash = createHash("sha256").update(JSON.stringify({ slug, raw })).digest("hex");

  const db = getDb();
  return db
    .transaction(() => {
      if (idempotencyKey) {
        const previous = db
          .prepare("SELECT request_hash, booking_id FROM booking_idempotency WHERE key = ?")
          .get(idempotencyKey) as { request_hash: string; booking_id: string } | undefined;
        if (previous) {
          if (previous.request_hash !== requestHash) {
            throw new DomainError("IDEMPOTENCY_CONFLICT", "This Idempotency-Key was already used for a different booking");
          }
          const booking = getBookingById(previous.booking_id);
          if (booking) return { booking, replayed: true };
        }
      }

      // The questions may have changed since the guest opened the page: then
      // answer with the new questions instead of validating against them blindly.
      const currentVersion = questionsVersion(page.questions);
      const sentVersion = (raw as { questionsVersion?: unknown } | null)?.questionsVersion;
      if (typeof sentVersion === "string" && sentVersion !== currentVersion) {
        throw new DomainError(
          "QUESTIONS_CHANGED",
          "The questions on this page were just updated. Please check your answers and book again.",
          undefined,
          { questions: page.questions, questionsVersion: currentVersion },
        );
      }

      // The schema is rebuilt from the current questions on every request.
      const parsed = makeBookingRequestSchema(page.questions).safeParse(raw);
      if (!parsed.success) throw validationError(parsed.error);
      const request = parsed.data;
      assertDuration(page, request.duration);
      const start = parseIsoWithOffset(request.start) as number; // validated by the schema
      const end = start + request.duration * 60 * 1000;

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

      const { name } = guestIdentity(page.questions, request.answers);
      const event: CalendarEvent = {
        id: `evt_${randomUUID()}`,
        title: `${page.title}: ${name}`,
        description: answersText(page.questions, request.answers),
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
        answers: request.answers,
        status: "confirmed",
        createdAt: new Date(now).toISOString(),
        cancelToken: randomBytes(24).toString("base64url"),
      };

      insertEvent(db, event);
      insertBooking(db, booking);
      if (idempotencyKey) {
        db.prepare(
          "INSERT INTO booking_idempotency (key, request_hash, booking_id, created_at) VALUES (?, ?, ?, ?)",
        ).run(idempotencyKey, requestHash, booking.id, new Date(now).toISOString());
      }
      return { booking, replayed: false };
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
