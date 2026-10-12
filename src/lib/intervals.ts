/**
 * Half-open time interval [start, end) in UTC epoch milliseconds.
 *
 * Availability maths works on plain numbers so it never depends on a timezone.
 * Timezones are applied only at the edges: when wall-clock times are converted
 * to instants and back (see lib/time/zoned.ts).
 */
export type Interval = { start: number; end: number };

/** Sorts and merges overlapping or touching intervals, dropping empty ones. */
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = intervals
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start);

  const merged: Interval[] = [];
  for (const current of sorted) {
    const last = merged.at(-1);
    if (last && current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

/** Parts of `from` that are not covered by any interval in `remove`. */
export function subtractIntervals(
  from: readonly Interval[],
  remove: readonly Interval[],
): Interval[] {
  const toRemove = mergeIntervals(remove);
  const result: Interval[] = [];

  for (const interval of mergeIntervals(from)) {
    let cursor = interval.start;
    for (const removed of toRemove) {
      if (removed.end <= cursor) continue;
      if (removed.start >= interval.end) break;
      if (removed.start > cursor) {
        result.push({ start: cursor, end: removed.start });
      }
      cursor = Math.max(cursor, removed.end);
    }
    if (cursor < interval.end) {
      result.push({ start: cursor, end: interval.end });
    }
  }
  return result;
}

/** Time covered by both `a` and `b`. */
export function intersectIntervals(
  a: readonly Interval[],
  b: readonly Interval[],
): Interval[] {
  const left = mergeIntervals(a);
  const right = mergeIntervals(b);
  const result: Interval[] = [];

  // Both lists are sorted and non-overlapping, so a two-pointer walk is enough.
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const l = left[i];
    const r = right[j];
    if (!l || !r) break;

    const start = Math.max(l.start, r.start);
    const end = Math.min(l.end, r.end);
    if (start < end) result.push({ start, end });

    if (l.end < r.end) i++;
    else j++;
  }
  return result;
}

/** Time covered by every list. With no lists there is no common time. */
export function intersectAllIntervals(
  lists: readonly (readonly Interval[])[],
): Interval[] {
  const [first, ...rest] = lists;
  if (!first) return [];
  return rest.reduce<Interval[]>(
    (common, list) => intersectIntervals(common, list),
    mergeIntervals(first),
  );
}
