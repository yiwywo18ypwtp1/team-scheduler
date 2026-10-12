/** A horizontal bar over day columns: [startIndex, endIndex). */
export type SpanItem = { id: string; startIndex: number; endIndex: number };

/**
 * Stacks horizontal bars (all-day and multi-day events, month cells) into lanes:
 * each bar goes into the lowest lane that is free for all of its days.
 *
 * Bars are taken by start day, longer ones first, so multi-day bars stay on
 * top. Remaining ties keep the caller's order (Array#sort is stable), so
 * callers sort by start time beforehand.
 */
export function assignLanes(items: readonly SpanItem[]): Map<string, number> {
  const sorted = [...items].sort(
    (a, b) =>
      a.startIndex - b.startIndex || b.endIndex - b.startIndex - (a.endIndex - a.startIndex),
  );

  // For each lane, the first day index that is free again.
  const laneEnds: number[] = [];
  const lanes = new Map<string, number>();

  for (const item of sorted) {
    let lane = laneEnds.findIndex((end) => end <= item.startIndex);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.endIndex);
    } else {
      laneEnds[lane] = item.endIndex;
    }
    lanes.set(item.id, lane);
  }
  return lanes;
}
