import "server-only";
import type { Interval } from "@/lib/intervals";
import type { Attendee, CalendarEvent } from "@/types/domain";
import { eventFromRow, getDb, type AttendeeRow, type EventRow } from "./db";

/**
 * Events overlapping `range`, optionally only those where one of `memberIds`
 * is an attendee. Two queries (events, then their attendees) instead of a JOIN
 * so each event row maps to exactly one CalendarEvent.
 */
export function listEvents({
  start,
  end,
  memberIds,
}: Interval & { memberIds?: string[] }): CalendarEvent[] {
  const db = getDb();
  const hasMemberFilter = memberIds !== undefined && memberIds.length > 0;

  // json_each() turns a JSON array parameter into rows, so the member list
  // can be bound as a single parameter instead of building "IN (?, ?, ...)".
  const rows = db
    .prepare(
      `SELECT * FROM events e
       WHERE e.start_ms < @end AND e.end_ms > @start
         AND (@noMemberFilter OR EXISTS (
           SELECT 1 FROM event_attendees a
           WHERE a.event_id = e.id AND a.member_id IN (SELECT value FROM json_each(@memberIds))
         ))
       ORDER BY e.start_ms, e.end_ms DESC, e.id`,
    )
    .all({
      start,
      end,
      noMemberFilter: hasMemberFilter ? 0 : 1,
      memberIds: JSON.stringify(memberIds ?? []),
    }) as EventRow[];

  const attendeesByEvent = loadAttendees(rows.map((row) => row.id));
  return rows.map((row) => eventFromRow(row, attendeesByEvent.get(row.id) ?? []));
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
