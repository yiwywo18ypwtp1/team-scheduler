import type { CalendarEvent, WorkingHours } from "@/types/domain";
import { intersectAllIntervals, mergeIntervals, subtractIntervals, type Interval } from "./intervals";
import { workingIntervals } from "./time/working-hours";

/** What availability needs to know about one person. */
export type MemberSchedule = {
  workingHours: readonly WorkingHours[];
  /** The member's own timezone: working hours are wall-clock times there. */
  timeZone: string;
  busy: readonly Interval[];
};

/**
 * Times a member is busy. Every event they attend counts, except ones they
 * declined; unanswered invitations block time too, to be safe.
 * All-day events (vacation, holiday) block the whole day.
 */
export function busyIntervalsFor(events: readonly CalendarEvent[], memberId: string): Interval[] {
  return mergeIntervals(
    events
      .filter((event) =>
        event.attendees.some((attendee) => attendee.memberId === memberId && attendee.status !== "declined"),
      )
      .map((event) => ({ start: Date.parse(event.start), end: Date.parse(event.end) })),
  );
}

/** Times a room is booked by any event. */
export function roomBusyIntervals(events: readonly CalendarEvent[], roomId: string): Interval[] {
  return mergeIntervals(
    events
      .filter((event) => event.location?.kind === "room" && event.location.roomId === roomId)
      .map((event) => ({ start: Date.parse(event.start), end: Date.parse(event.end) })),
  );
}

/** Working time minus busy time, within `range`. */
export function freeIntervals(schedule: MemberSchedule, range: Interval): Interval[] {
  return subtractIntervals(workingIntervals(schedule.workingHours, schedule.timeZone, range), schedule.busy);
}

/**
 * Windows when everyone is free (each within their own working hours, in their
 * own timezone) and the optional extra resource (a room) is not booked,
 * keeping only windows long enough for the meeting.
 *
 * Everything is UTC intervals, so members 20 hours apart need no special case:
 * their working days simply overlap (or don't) on the absolute timeline.
 */
export function findCommonWindows({
  schedules,
  extraBusy = [],
  range,
  minDurationMs,
}: {
  schedules: readonly MemberSchedule[];
  extraBusy?: readonly Interval[];
  range: Interval;
  minDurationMs: number;
}): Interval[] {
  const common = intersectAllIntervals(schedules.map((schedule) => freeIntervals(schedule, range)));
  return subtractIntervals(common, extraBusy).filter((window) => window.end - window.start >= minDurationMs);
}
