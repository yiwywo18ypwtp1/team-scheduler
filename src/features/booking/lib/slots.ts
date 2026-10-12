import { subtractIntervals, type Interval } from "@/lib/intervals";
import { dateKeyInTimeZone, type DateKey } from "@/lib/time/zoned";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** Slots start on a 30-minute grid (in UTC, which is also :00/:30 in whole and half-hour zones). */
export const SLOT_STEP_MINUTES = 30;

/**
 * The time window in which slots may start and end, from the page settings:
 * not earlier than `minNotice` from now, not later than `horizonDays` ahead.
 */
export function bookableWindow({
  now,
  minNoticeMinutes,
  horizonDays,
}: {
  now: number;
  minNoticeMinutes: number;
  horizonDays: number;
}): Interval {
  return { start: now + minNoticeMinutes * MINUTE_MS, end: now + horizonDays * DAY_MS };
}

/**
 * Bookable slots inside the owner's working time.
 *
 * Buffers: a slot [s, s + duration] needs `bufferBefore` free before it and
 * `bufferAfter` free after it. That is the same as growing every busy
 * interval by `bufferAfter` at its start and `bufferBefore` at its end, and
 * requiring the slot itself not to touch the grown intervals.
 *
 * `working` must already be clipped to the bookable window (minNotice/horizon).
 */
export function computeSlots({
  working,
  busy,
  durationMinutes,
  bufferBeforeMinutes,
  bufferAfterMinutes,
  stepMinutes = SLOT_STEP_MINUTES,
}: {
  working: readonly Interval[];
  busy: readonly Interval[];
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  stepMinutes?: number;
}): Interval[] {
  const duration = durationMinutes * MINUTE_MS;
  const step = stepMinutes * MINUTE_MS;
  const blocked = busy.map((interval) => ({
    start: interval.start - bufferAfterMinutes * MINUTE_MS,
    end: interval.end + bufferBeforeMinutes * MINUTE_MS,
  }));

  const slots: Interval[] = [];
  for (const free of subtractIntervals(working, blocked)) {
    for (let start = Math.ceil(free.start / step) * step; start + duration <= free.end; start += step) {
      slots.push({ start, end: start + duration });
    }
  }
  return slots;
}

/** Slots grouped by calendar day in the guest's timezone, in order. */
export function groupSlotsByDay(slots: readonly Interval[], timeZone: string): Map<DateKey, Interval[]> {
  const byDay = new Map<DateKey, Interval[]>();
  for (const slot of slots) {
    const day = dateKeyInTimeZone(slot.start, timeZone);
    const list = byDay.get(day) ?? [];
    list.push(slot);
    byDay.set(day, list);
  }
  return byDay;
}

/** Up to `count` slots closest in time to `target`, returned in chronological order. */
export function nearestSlots(slots: readonly Interval[], target: number, count: number): Interval[] {
  return [...slots]
    .sort((a, b) => Math.abs(a.start - target) - Math.abs(b.start - target) || a.start - b.start)
    .slice(0, count)
    .sort((a, b) => a.start - b.start);
}
