export type TimedItem = { id: string; start: number; end: number };
export type ColumnPlacement = { column: number; columnCount: number };

/**
 * Side-by-side layout of overlapping events within one day, like Google Calendar.
 *
 * 1. Sort by start; on ties the longer event goes first (leftmost).
 * 2. Walk the list keeping a "cluster": events connected by overlaps,
 *    directly or through a chain. A cluster closes once the next event starts
 *    after everything in it has ended.
 * 3. Inside a cluster each event takes the first column whose previous event
 *    has already ended, or opens a new column.
 * 4. All events of a cluster share its column count, so their widths line up.
 *
 * Touching events (one ends exactly when the next starts) do not overlap.
 * O(n log n) for the sort plus O(n * columns) for placement.
 */
export function layoutOverlappingEvents(
  items: readonly TimedItem[],
): Map<string, ColumnPlacement> {
  const sorted = [...items].sort(
    (a, b) => a.start - b.start || b.end - a.end || a.id.localeCompare(b.id),
  );

  const placements = new Map<string, ColumnPlacement>();
  let cluster: { id: string; column: number }[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -Infinity;

  const closeCluster = () => {
    for (const { id, column } of cluster) {
      placements.set(id, { column, columnCount: columnEnds.length });
    }
    cluster = [];
    columnEnds = [];
  };

  for (const item of sorted) {
    if (item.start >= clusterEnd) closeCluster();

    let column = columnEnds.findIndex((end) => end <= item.start);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(item.end);
    } else {
      columnEnds[column] = item.end;
    }

    cluster.push({ id: item.id, column });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  closeCluster();

  return placements;
}
