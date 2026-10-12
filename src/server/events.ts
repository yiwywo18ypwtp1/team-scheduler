import "server-only";
import { randomUUID } from "node:crypto";
import { eventToFormValues, formValuesToEventFields, toWallFields } from "@/features/events/form-values";
import { makeEventFormSchema, type EventFormValues } from "@/features/events/schema";
import { DomainError, validationError } from "@/lib/errors";
import type { Interval } from "@/lib/intervals";
import { expandEvent, parseOccurrenceId } from "@/lib/recurrence/expand";
import type { Attendee, CalendarEvent } from "@/types/domain";
import { eventFromRow, getDb, insertEvent, type AttendeeRow, type EventRow } from "./db";
import { listMembers } from "./members";
import { listRooms } from "./rooms";

/**
 * Events overlapping `range`, optionally only those where one of `memberIds`
 * is an attendee and/or booked in `roomId`. Recurring series are expanded
 * here, on the server, into one event per occurrence in the range.
 *
 * Two queries (events, then their attendees) instead of a JOIN, so each event
 * row maps to one CalendarEvent. A series master can't be filtered by its end
 * in SQL (the rule decides it), so every master that starts before the range
 * end is loaded and expanded in code.
 */
export function listEvents({
  start,
  end,
  memberIds,
  roomId,
}: Interval & { memberIds?: string[]; roomId?: string }): CalendarEvent[] {
  const db = getDb();
  const hasMemberFilter = memberIds !== undefined && memberIds.length > 0;

  // json_each() turns a JSON array parameter into rows, so the member list
  // can be bound as a single parameter instead of building "IN (?, ?, ...)".
  const rows = db
    .prepare(
      `SELECT * FROM events e
       WHERE e.start_ms < @end AND (e.rrule IS NOT NULL OR e.end_ms > @start)
         AND (@roomId IS NULL OR e.location_room_id = @roomId)
         AND (@noMemberFilter OR EXISTS (
           SELECT 1 FROM event_attendees a
           WHERE a.event_id = e.id AND a.member_id IN (SELECT value FROM json_each(@memberIds))
         ))
       ORDER BY e.start_ms, e.end_ms DESC, e.id`,
    )
    .all({
      start,
      end,
      roomId: roomId ?? null,
      noMemberFilter: hasMemberFilter ? 0 : 1,
      memberIds: JSON.stringify(memberIds ?? []),
    }) as EventRow[];

  const attendeesByEvent = loadAttendees(rows.map((row) => row.id));
  return rows
    .map((row) => eventFromRow(row, attendeesByEvent.get(row.id) ?? []))
    .flatMap((event) => expandEvent(event, { start, end }))
    .sort(
      (a, b) =>
        Date.parse(a.start) - Date.parse(b.start) || Date.parse(b.end) - Date.parse(a.end) || a.id.localeCompare(b.id),
    );
}

function loadAttendees(eventIds: string[]): Map<string, Attendee[]> {
  const rows = getDb()
    .prepare(
      `SELECT event_id, member_id, status FROM event_attendees
       WHERE event_id IN (SELECT value FROM json_each(?))
       ORDER BY rowid`,
    )
    .all(JSON.stringify(eventIds)) as AttendeeRow[];

  const byEvent = new Map<string, Attendee[]>();
  for (const row of rows) {
    const list = byEvent.get(row.event_id) ?? [];
    list.push({ memberId: row.member_id, status: row.status });
    byEvent.set(row.event_id, list);
  }
  return byEvent;
}

/** A stored event, or one occurrence of a series when `id` is an occurrence id. */
export function getEvent(id: string): CalendarEvent | undefined {
  const occurrence = parseOccurrenceId(id);
  if (occurrence) {
    const master = getStoredEvent(occurrence.masterId);
    if (!master?.rrule) return undefined;
    // An exdate or a time outside the rule means this occurrence doesn't exist.
    const point = { start: occurrence.originalStart, end: occurrence.originalStart + 1 };
    return expandEvent(master, point).find((event) => event.id === id);
  }
  return getStoredEvent(id);
}

function getStoredEvent(id: string): CalendarEvent | undefined {
  const row = getDb().prepare("SELECT * FROM events WHERE id = ?").get(id) as EventRow | undefined;
  return row && eventFromRow(row, loadAttendees([id]).get(id) ?? []);
}

/**
 * Occurrences are virtual: changing one needs a scope (this / following / all).
 * Plain update/delete/move only accept stored events.
 */
function assertStoredEventId(id: string) {
  if (parseOccurrenceId(id)) {
    throw new DomainError("VALIDATION_ERROR", "This is one occurrence of a series: choose which occurrences to change");
  }
}

function requireEvent(id: string): CalendarEvent {
  const event = getEvent(id);
  if (!event) throw new DomainError("NOT_FOUND", "Event not found. It may have been deleted.");
  return event;
}

/**
 * Server-side permission rule: only attendees may change or delete an event.
 * The UI also disables editing for non-attendees, but that is a convenience;
 * this check is what actually protects the data.
 */
function assertCanEdit(event: CalendarEvent, actorId: string) {
  if (!event.attendees.some((attendee) => attendee.memberId === actorId)) {
    throw new DomainError("FORBIDDEN", "Only attendees can change this event");
  }
}

function assertVersion(event: CalendarEvent, expectedVersion: number | undefined) {
  if (expectedVersion !== undefined && event.version !== expectedVersion) {
    throw new DomainError(
      "VERSION_CONFLICT",
      "This event was changed by someone else. Reload to see the latest version.",
    );
  }
}

/** Same schema as the client, plus checks that need the database. */
function parseEventValues(raw: unknown): EventFormValues {
  const parsed = makeEventFormSchema(listRooms()).safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error);

  const knownIds = new Set(listMembers().map((member) => member.id));
  const unknownIds = parsed.data.attendeeIds.filter((id) => !knownIds.has(id));
  if (unknownIds.length > 0) {
    throw new DomainError("VALIDATION_ERROR", "Some fields are invalid", {
      attendeeIds: [`These members no longer exist: ${unknownIds.join(", ")}`],
    });
  }
  return parsed.data;
}

/** Existing answers are kept; new attendees start as "pending", the author as "accepted". */
function buildAttendees(memberIds: string[], actorId: string, previous: Attendee[] = []): Attendee[] {
  return memberIds.map((memberId) => ({
    memberId,
    status:
      previous.find((attendee) => attendee.memberId === memberId)?.status ??
      (memberId === actorId ? "accepted" : "pending"),
  }));
}

export function createEvent(raw: unknown, actorId: string): CalendarEvent {
  const values = parseEventValues(raw);
  const event: CalendarEvent = {
    id: `evt_${randomUUID()}`,
    ...formValuesToEventFields(values),
    attendees: buildAttendees(values.attendeeIds, actorId),
    version: 1,
  };

  const db = getDb();
  db.transaction(() => insertEvent(db, event))();
  return event;
}

/**
 * PATCH semantics: `patch` is merged over the event's current form values,
 * so a client may send only the fields it changes. `expectedVersion` gives
 * optimistic concurrency: a stale version fails with 409 instead of silently
 * overwriting someone else's change.
 */
export function updateEvent(
  id: string,
  patch: unknown,
  { actorId, expectedVersion }: { actorId: string; expectedVersion: number },
): CalendarEvent {
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    throw new DomainError("VALIDATION_ERROR", "Expected a JSON object");
  }

  assertStoredEventId(id);
  const db = getDb();
  // Read, check and write in one transaction, so no other write can slip in between.
  return db.transaction(() => {
    const current = requireEvent(id);
    assertCanEdit(current, actorId);
    assertVersion(current, expectedVersion);

    const values = parseEventValues({ ...eventToFormValues(current), ...patch });
    const updated: CalendarEvent = {
      ...current,
      ...formValuesToEventFields(values),
      attendees: buildAttendees(values.attendeeIds, actorId, current.attendees),
      version: current.version + 1,
    };

    // Replace the row; attendees are removed by ON DELETE CASCADE and re-inserted.
    db.prepare("DELETE FROM events WHERE id = ?").run(id);
    insertEvent(db, updated);
    return updated;
  })();
}

/**
 * Moves a timed event to new instants (drag-n-drop). Expressed as a PATCH of
 * the wall-clock fields in the event's own timezone, so it goes through the
 * same validation, permission and version checks as any other edit.
 */
export function moveEvent(
  id: string,
  { start, end }: Interval,
  options: { actorId: string; expectedVersion: number },
): CalendarEvent {
  assertStoredEventId(id);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new DomainError("VALIDATION_ERROR", "Start and end must be timestamps");
  }
  const current = requireEvent(id);
  if (current.allDay) {
    throw new DomainError("VALIDATION_ERROR", "All-day events can't be moved on the time grid");
  }
  // If the event changes between this read and the update, the version check fails.
  return updateEvent(id, toWallFields(start, end, current.timezone), options);
}

export function deleteEvent(
  id: string,
  { actorId, expectedVersion }: { actorId: string; expectedVersion?: number },
) {
  assertStoredEventId(id);
  const db = getDb();
  db.transaction(() => {
    const current = requireEvent(id);
    assertCanEdit(current, actorId);
    assertVersion(current, expectedVersion);
    db.prepare("DELETE FROM events WHERE id = ?").run(id);
  })();
}
