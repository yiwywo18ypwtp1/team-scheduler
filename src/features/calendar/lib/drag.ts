export const SNAP_MINUTES = 15;

export type DropPosition = {
  dayIndex: number;
  /** Start in minutes from the target day's local midnight; negative = starts the day before. */
  startMinute: number;
};

/**
 * Where a dragged event would land, from the pointer position relative to the
 * day columns. Pure geometry, so it is unit-tested without a browser.
 *
 * `grabOffsetMinutes` is how far below the event's start the user grabbed it;
 * keeping it makes the event follow the pointer instead of jumping its top
 * edge to the cursor. The start snaps to 15 minutes and is clamped so at
 * least one snap step stays inside the target day.
 */
export function dropPosition({
  x,
  y,
  width,
  dayMinutes,
  grabOffsetMinutes,
  durationMinutes,
  minuteHeightPx,
}: {
  /** Pointer position relative to the top-left of the day columns. */
  x: number;
  y: number;
  /** Width of all day columns together. */
  width: number;
  /** Length of each visible day; 1380 or 1500 on DST days. */
  dayMinutes: readonly number[];
  grabOffsetMinutes: number;
  durationMinutes: number;
  minuteHeightPx: number;
}): DropPosition {
  const dayCount = dayMinutes.length;
  const dayIndex = Math.min(Math.max(Math.floor((x / width) * dayCount), 0), dayCount - 1);
  const lengthOfDay = dayMinutes[dayIndex] ?? 24 * 60;

  const rawStart = y / minuteHeightPx - grabOffsetMinutes;
  const snapped = Math.round(rawStart / SNAP_MINUTES) * SNAP_MINUTES;
  const earliest = -(Math.ceil(durationMinutes / SNAP_MINUTES) - 1) * SNAP_MINUTES;
  const latest = lengthOfDay - SNAP_MINUTES;

  return { dayIndex, startMinute: Math.min(Math.max(snapped, earliest), latest) };
}
