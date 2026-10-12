"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import {
  addDaysToDateKey,
  dayIntervalInTimeZone,
  floatingToInstant,
  formatDateKey,
  formatInTimeZone,
  instantToFloating,
  type DateKey,
} from "@/lib/time/zoned";
import type { CalendarEvent } from "@/types/domain";
import { dropPosition, SNAP_MINUTES } from "../lib/drag";
import type { TimedSegment, WeekDayLayout } from "../lib/week-layout";
import { eventToneClass } from "./event-style";
import { MIN_EVENT_HEIGHT_PX, MINUTE_HEIGHT_PX } from "./grid-constants";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** Pointer travel before a press becomes a drag; shorter is a click that opens the event. */
const DRAG_THRESHOLD_PX = 4;
/** Holding a dragged event at the left/right edge this long moves the target by one period. */
const EDGE_PX = 24;
const EDGE_DELAY_MS = 700;
/** Near the top/bottom of the scroll area the grid scrolls by itself. */
const AUTOSCROLL_ZONE_PX = 40;
const AUTOSCROLL_STEP_PX = 12;

export type MoveRequest = {
  event: CalendarEvent;
  start: number;
  end: number;
  /** Set when the target date is outside the visible days: the calendar goes there after the move. */
  navigateTo?: DateKey;
  /** The change came from the keyboard: keep focus on the event. */
  viaKeyboard?: boolean;
};

type Props = {
  segment: TimedSegment;
  days: WeekDayLayout[];
  timeZone: string;
  currentUserId: string;
  /** Element covering the day columns; drag geometry and the preview use it. */
  overlay: HTMLElement | null;
  /** UI hint only: the server still checks permissions on save. */
  canDrag: boolean;
  onMove: (request: MoveRequest) => void;
  onDelete: (event: CalendarEvent) => void;
};

type Mode = "move" | "resize";

type PressState = {
  mode: Mode;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  /** Minutes between the event's start and the point where it was grabbed. */
  grabOffsetMinutes: number;
  isDragging: boolean;
  /** How many periods (weeks, or days in Day view) the target moved past the visible ones. */
  periodShift: number;
  edgeDirection: -1 | 0 | 1;
  edgeTimer?: ReturnType<typeof setTimeout>;
  scrollSpeed: number;
  scrollFrame?: number;
};

type Preview = { mode: Mode; dayIndex: number; startMinute: number; endMinute: number; periodShift: number };

function formatRange(start: number, end: number, timeZone: string) {
  return `${formatInTimeZone(start, timeZone, "HH:mm")}–${formatInTimeZone(end, timeZone, "HH:mm")}`;
}

/** Same wall-clock time `days` later (a day can be 23 or 25 hours long). */
function shiftDays(instant: number, days: number, timeZone: string) {
  return floatingToInstant(instantToFloating(instant, timeZone) + days * DAY_MS, timeZone);
}

/**
 * A timed event in the grid: drag to move (also to another day, or past the
 * visible days by holding it at the edge), drag the bottom edge to resize,
 * or use the keyboard (arrows: 15 min / 1 day, Delete). Enter opens it.
 *
 * Drag state lives here, in the one block being dragged, not in WeekView, so
 * only this block and its preview re-render during a drag. State is updated
 * only when the snapped position changes, not on every pointermove.
 */
export function TimedEventBlock({ segment, days, timeZone, currentUserId, overlay, canDrag, onMove, onDelete }: Props) {
  const { event, startMinute, endMinute, column, columnCount } = segment;
  const start = Date.parse(event.start);
  const end = Date.parse(event.end);
  const durationMinutes = (end - start) / MINUTE_MS;
  const dayIndexOfSegment = days.findIndex((day) => day.date === segment.date);

  const [preview, setPreview] = useState<Preview | null>(null);
  const pressRef = useRef<PressState | null>(null);
  const previewRef = useRef<Preview | null>(null);
  // A drag ends with a click on the same element; that click must not open the event.
  const suppressClickRef = useRef(false);

  const showPreview = (next: Preview | null) => {
    const current = previewRef.current;
    const same =
      current &&
      next &&
      current.mode === next.mode &&
      current.dayIndex === next.dayIndex &&
      current.startMinute === next.startMinute &&
      current.endMinute === next.endMinute &&
      current.periodShift === next.periodShift;
    if (same) return; // nothing moved by a snap step: no re-render
    previewRef.current = next;
    setPreview(next);
  };

  const computePreview = (press: PressState): Preview | null => {
    if (!overlay) return null;
    const rect = overlay.getBoundingClientRect();
    if (press.mode === "resize") {
      const day = days[dayIndexOfSegment];
      if (!day) return null;
      const pointerMinute = (press.lastY - rect.top) / MINUTE_HEIGHT_PX;
      const snapped = Math.round(pointerMinute / SNAP_MINUTES) * SNAP_MINUTES;
      const endAt = Math.min(Math.max(snapped, startMinute + SNAP_MINUTES), day.minutes);
      return { mode: "resize", dayIndex: dayIndexOfSegment, startMinute, endMinute: endAt, periodShift: 0 };
    }
    const position = dropPosition({
      x: press.lastX - rect.left,
      y: press.lastY - rect.top,
      width: rect.width,
      dayMinutes: days.map((day) => day.minutes),
      grabOffsetMinutes: press.grabOffsetMinutes,
      durationMinutes,
      minuteHeightPx: MINUTE_HEIGHT_PX,
    });
    return { mode: "move", ...position, endMinute: position.startMinute + durationMinutes, periodShift: press.periodShift };
  };

  const stopTimers = (press: PressState | null) => {
    if (!press) return;
    if (press.edgeTimer) clearTimeout(press.edgeTimer);
    if (press.scrollFrame) cancelAnimationFrame(press.scrollFrame);
    press.edgeTimer = undefined;
    press.scrollFrame = undefined;
  };

  const cancelDrag = () => {
    stopTimers(pressRef.current);
    pressRef.current = null;
    showPreview(null);
  };

  // Escape cancels an active drag. Listening on window, because focus stays
  // wherever it was when the drag started.
  const isDragging = preview !== null;
  useEffect(() => {
    if (!isDragging) return;
    const onKeyDown = (keyEvent: globalThis.KeyboardEvent) => {
      if (keyEvent.key !== "Escape") return;
      keyEvent.preventDefault();
      suppressClickRef.current = true;
      cancelDrag();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // cancelDrag only touches refs and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging]);

  /** Edge of the columns: after a pause, move the target one period further. */
  const updateEdge = (press: PressState) => {
    if (press.mode !== "move" || !overlay) return;
    const rect = overlay.getBoundingClientRect();
    const direction = press.lastX < rect.left + EDGE_PX ? -1 : press.lastX > rect.right - EDGE_PX ? 1 : 0;
    if (direction === press.edgeDirection) return;
    if (press.edgeTimer) clearTimeout(press.edgeTimer);
    press.edgeTimer = undefined;
    press.edgeDirection = direction;
    if (direction === 0) return;
    const step = () => {
      if (pressRef.current !== press) return;
      press.periodShift += direction;
      showPreview(computePreview(press));
      press.edgeTimer = setTimeout(step, EDGE_DELAY_MS); // keep going while held at the edge
    };
    press.edgeTimer = setTimeout(step, EDGE_DELAY_MS);
  };

  /** Top/bottom of the scroll area: scroll the grid while dragging. */
  const updateAutoscroll = (press: PressState) => {
    const container = overlay?.closest<HTMLElement>("[data-scroll-container]");
    if (!container) return;
    const rect = container.getBoundingClientRect();
    // Only when the pointer moved toward that edge: a drag that merely starts
    // near the top or bottom (e.g. a sideways move) must not scroll.
    const movingUp = press.lastY < press.startY - DRAG_THRESHOLD_PX;
    const movingDown = press.lastY > press.startY + DRAG_THRESHOLD_PX;
    press.scrollSpeed =
      movingUp && press.lastY < rect.top + AUTOSCROLL_ZONE_PX
        ? -AUTOSCROLL_STEP_PX
        : movingDown && press.lastY > rect.bottom - AUTOSCROLL_ZONE_PX
          ? AUTOSCROLL_STEP_PX
          : 0;
    if (press.scrollSpeed === 0 || press.scrollFrame) return;
    const tick = () => {
      if (pressRef.current !== press || press.scrollSpeed === 0) {
        press.scrollFrame = undefined;
        return;
      }
      container.scrollTop += press.scrollSpeed;
      showPreview(computePreview(press));
      press.scrollFrame = requestAnimationFrame(tick);
    };
    press.scrollFrame = requestAnimationFrame(tick);
  };

  const startPress = (pointer: ReactPointerEvent<HTMLElement>, mode: Mode) => {
    if (!canDrag || !overlay || pointer.button !== 0) return;
    pointer.stopPropagation();
    const rect = overlay.getBoundingClientRect();
    const dayStart = days[dayIndexOfSegment]?.interval.start ?? start;
    const pointerInstant = dayStart + ((pointer.clientY - rect.top) / MINUTE_HEIGHT_PX) * MINUTE_MS;
    pressRef.current = {
      mode,
      startX: pointer.clientX,
      startY: pointer.clientY,
      lastX: pointer.clientX,
      lastY: pointer.clientY,
      grabOffsetMinutes: (pointerInstant - start) / MINUTE_MS,
      isDragging: false,
      periodShift: 0,
      edgeDirection: 0,
      scrollSpeed: 0,
    };
    // Keep receiving pointer events even when the pointer leaves this block.
    pointer.currentTarget.setPointerCapture(pointer.pointerId);
  };

  const onPointerMove = (pointer: ReactPointerEvent<HTMLElement>) => {
    const press = pressRef.current;
    if (!press) return;
    press.lastX = pointer.clientX;
    press.lastY = pointer.clientY;
    if (!press.isDragging) {
      const distance = Math.hypot(pointer.clientX - press.startX, pointer.clientY - press.startY);
      if (distance < DRAG_THRESHOLD_PX) return;
      press.isDragging = true;
    }
    showPreview(computePreview(press));
    updateEdge(press);
    updateAutoscroll(press);
  };

  const onPointerUp = () => {
    const press = pressRef.current;
    stopTimers(press);
    pressRef.current = null;
    const target = previewRef.current;
    showPreview(null);
    if (!press?.isDragging || !target) return; // a plain click: let the link open the event

    suppressClickRef.current = true;
    const visibleDay = days[target.dayIndex];
    if (!visibleDay) return;

    if (target.mode === "resize") {
      const newEnd = visibleDay.interval.start + target.endMinute * MINUTE_MS;
      if (newEnd !== end) onMove({ event, start, end: newEnd });
      return;
    }

    // Past the visible days: the same column, `periodShift` periods away.
    const targetDate = addDaysToDateKey(visibleDay.date, target.periodShift * days.length);
    const dayStart =
      target.periodShift === 0 ? visibleDay.interval.start : dayIntervalInTimeZone(targetDate, timeZone).start;
    const newStart = dayStart + target.startMinute * MINUTE_MS;
    if (newStart === start) return;
    onMove({
      event,
      start: newStart,
      end: newStart + (end - start),
      navigateTo: target.periodShift === 0 ? undefined : targetDate,
    });
  };

  const onKeyDown = (keyEvent: KeyboardEvent<HTMLAnchorElement>) => {
    if (!canDrag || keyEvent.altKey || keyEvent.metaKey || keyEvent.ctrlKey) return;
    const step = SNAP_MINUTES * MINUTE_MS;
    let next: { start: number; end: number } | null = null;
    if (keyEvent.key === "ArrowUp") next = { start: start - step, end: end - step };
    if (keyEvent.key === "ArrowDown") next = { start: start + step, end: end + step };
    if (keyEvent.key === "ArrowLeft" || keyEvent.key === "ArrowRight") {
      const days = keyEvent.key === "ArrowLeft" ? -1 : 1;
      const newStart = shiftDays(start, days, timeZone);
      next = { start: newStart, end: newStart + (end - start) };
    }
    if (keyEvent.key === "Delete" || keyEvent.key === "Backspace") {
      keyEvent.preventDefault();
      onDelete(event);
      return;
    }
    if (!next) return;
    keyEvent.preventDefault();
    const targetDate = formatInTimeZone(next.start, timeZone, "yyyy-MM-dd");
    const isVisible = days.some((day) => day.date === targetDate);
    onMove({ event, ...next, viaKeyboard: true, navigateTo: isVisible ? undefined : targetDate });
  };

  const timeRange = formatRange(start, end, timeZone);
  const height = Math.max((endMinute - startMinute) * MINUTE_HEIGHT_PX, MIN_EVENT_HEIGHT_PX);
  const tone = eventToneClass(event, currentUserId);
  const canResize = canDrag && !segment.continuesAfter;

  return (
    <>
      <Link
        href={`/calendar/events/${event.id}`}
        data-event-id={event.id}
        // Keep the grid's scroll position when the modal opens.
        scroll={false}
        // Links are natively draggable; that would hijack the pointer events.
        draggable={false}
        aria-label={`${event.title}, ${timeRange}${event.seriesId ? ", repeats" : ""}`}
        aria-keyshortcuts={canDrag ? "ArrowUp ArrowDown ArrowLeft ArrowRight Delete" : undefined}
        onClick={(click) => {
          if (!suppressClickRef.current) return;
          suppressClickRef.current = false;
          click.preventDefault();
        }}
        onKeyDown={onKeyDown}
        onPointerDown={(pointer) => startPress(pointer, "move")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={cancelDrag}
        className={`absolute z-10 block touch-none overflow-hidden rounded border px-1.5 py-0.5 text-xs leading-tight select-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none ${tone} ${
          segment.continuesBefore ? "rounded-t-none" : ""
        } ${segment.continuesAfter ? "rounded-b-none" : ""} ${canDrag ? "cursor-grab" : ""} ${isDragging ? "opacity-40" : ""}`}
        style={{
          top: startMinute * MINUTE_HEIGHT_PX,
          height,
          left: `calc(${(column / columnCount) * 100}% + 1px)`,
          width: `calc(${100 / columnCount}% - 2px)`,
        }}
      >
        <div className="truncate font-medium">
          {event.seriesId && <span aria-hidden>↻ </span>}
          {event.title}
        </div>
        {height > 2 * MIN_EVENT_HEIGHT_PX && <div className="truncate opacity-80">{timeRange}</div>}
        {canResize && (
          // Bottom edge: drag to change the end time.
          <span
            aria-hidden
            data-resize-handle
            onPointerDown={(pointer) => startPress(pointer, "resize")}
            className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
          />
        )}
      </Link>

      {preview && overlay && (
        <DragPreview
          event={event}
          preview={preview}
          days={days}
          timeZone={timeZone}
          tone={tone}
          container={overlay}
        />
      )}
    </>
  );
}

/** Ghost of the event at the drop position, portalled into the overlay above all columns. */
function DragPreview({
  event,
  preview,
  days,
  timeZone,
  tone,
  container,
}: {
  event: CalendarEvent;
  preview: Preview;
  days: WeekDayLayout[];
  timeZone: string;
  tone: string;
  container: HTMLElement;
}) {
  const visibleDay = days[preview.dayIndex];
  if (!visibleDay) return null;

  const targetDate = addDaysToDateKey(visibleDay.date, preview.periodShift * days.length);
  const dayStart =
    preview.periodShift === 0 ? visibleDay.interval.start : dayIntervalInTimeZone(targetDate, timeZone).start;
  const newStart = dayStart + preview.startMinute * MINUTE_MS;
  const newEnd = dayStart + preview.endMinute * MINUTE_MS;
  const top = Math.max(preview.startMinute, 0);
  const bottom = Math.min(preview.endMinute, visibleDay.minutes);

  return createPortal(
    <div
      aria-hidden
      className={`absolute z-30 overflow-hidden rounded border-2 px-1.5 py-0.5 text-xs leading-tight shadow-lg ${tone} ${
        preview.periodShift !== 0 ? "border-dashed" : ""
      }`}
      style={{
        left: `calc(${(preview.dayIndex / days.length) * 100}% + 2px)`,
        width: `calc(${100 / days.length}% - 4px)`,
        top: top * MINUTE_HEIGHT_PX,
        height: Math.max((bottom - top) * MINUTE_HEIGHT_PX, MIN_EVENT_HEIGHT_PX),
      }}
    >
      <div className="truncate font-medium">{event.title}</div>
      <div className="truncate">{formatRange(newStart, newEnd, timeZone)}</div>
      {preview.periodShift !== 0 && (
        <div className="truncate font-medium">→ {formatDateKey(targetDate, "EEE, MMM d")}</div>
      )}
    </div>,
    container,
  );
}
