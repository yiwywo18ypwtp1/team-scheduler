"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { formatInTimeZone } from "@/lib/time/zoned";
import type { CalendarEvent } from "@/types/domain";
import { dropPosition, type DropPosition } from "../lib/drag";
import type { TimedSegment, WeekDayLayout } from "../lib/week-layout";
import { eventToneClass } from "./event-style";
import { MIN_EVENT_HEIGHT_PX, MINUTE_HEIGHT_PX } from "./grid-constants";

const MINUTE_MS = 60 * 1000;
/** Pointer travel before a press becomes a drag; shorter is a click that opens the event. */
const DRAG_THRESHOLD_PX = 4;

type Props = {
  segment: TimedSegment;
  days: WeekDayLayout[];
  timeZone: string;
  currentUserId: string;
  /** Element covering the day columns; drag geometry and the preview use it. */
  overlay: HTMLElement | null;
  /** UI hint only: the server still checks permissions on save. */
  canDrag: boolean;
  onMove: (event: CalendarEvent, start: number, end: number) => void;
};

type PressState = {
  startX: number;
  startY: number;
  /** Minutes between the event's start and the point where it was grabbed. */
  grabOffsetMinutes: number;
  isDragging: boolean;
};

function formatRange(start: number, end: number, timeZone: string) {
  return `${formatInTimeZone(start, timeZone, "HH:mm")}–${formatInTimeZone(end, timeZone, "HH:mm")}`;
}

/**
 * A timed event in the week grid, draggable to another time or day.
 *
 * Drag state lives here, in the one block being dragged, not in WeekView.
 * So during a drag only this block and its preview re-render; the other
 * events and the grid don't. State is also updated only when the snapped
 * 15-minute position changes, not on every pointermove.
 */
export function TimedEventBlock({ segment, days, timeZone, currentUserId, overlay, canDrag, onMove }: Props) {
  const { event, startMinute, endMinute, column, columnCount } = segment;
  const start = Date.parse(event.start);
  const end = Date.parse(event.end);
  const durationMinutes = (end - start) / MINUTE_MS;

  const [preview, setPreview] = useState<DropPosition | null>(null);
  const pressRef = useRef<PressState | null>(null);
  // A drag ends with a click on the same element; that click must not open the event.
  const suppressClickRef = useRef(false);

  const positionFrom = (clientX: number, clientY: number, grabOffsetMinutes: number) => {
    const rect = (overlay as HTMLElement).getBoundingClientRect();
    return dropPosition({
      x: clientX - rect.left,
      y: clientY - rect.top,
      width: rect.width,
      dayMinutes: days.map((day) => day.minutes),
      grabOffsetMinutes,
      durationMinutes,
      minuteHeightPx: MINUTE_HEIGHT_PX,
    });
  };

  const cancelDrag = () => {
    pressRef.current = null;
    setPreview(null);
  };

  // Escape cancels an active drag. Listening on window, because focus stays
  // wherever it was when the drag started.
  const isDragging = preview !== null;
  useEffect(() => {
    if (!isDragging) return;
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== "Escape") return;
      keyEvent.preventDefault();
      suppressClickRef.current = true;
      cancelDrag();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isDragging]);

  const onPointerDown = (pointer: ReactPointerEvent<HTMLElement>) => {
    if (!canDrag || !overlay || pointer.button !== 0) return;
    const rect = overlay.getBoundingClientRect();
    const dayStart = days.find((day) => day.date === segment.date)?.interval.start ?? start;
    const pointerInstant = dayStart + ((pointer.clientY - rect.top) / MINUTE_HEIGHT_PX) * MINUTE_MS;

    pressRef.current = {
      startX: pointer.clientX,
      startY: pointer.clientY,
      grabOffsetMinutes: (pointerInstant - start) / MINUTE_MS,
      isDragging: false,
    };
    // Keep receiving pointer events even when the pointer leaves this block.
    pointer.currentTarget.setPointerCapture(pointer.pointerId);
  };

  const onPointerMove = (pointer: ReactPointerEvent<HTMLElement>) => {
    const press = pressRef.current;
    if (!press) return;
    if (!press.isDragging) {
      const distance = Math.hypot(pointer.clientX - press.startX, pointer.clientY - press.startY);
      if (distance < DRAG_THRESHOLD_PX) return;
      press.isDragging = true;
    }

    const next = positionFrom(pointer.clientX, pointer.clientY, press.grabOffsetMinutes);
    // Same snapped position -> keep the old object, so React skips the re-render.
    setPreview((current) =>
      current && current.dayIndex === next.dayIndex && current.startMinute === next.startMinute
        ? current
        : next,
    );
  };

  const onPointerUp = (pointer: ReactPointerEvent<HTMLElement>) => {
    const press = pressRef.current;
    pressRef.current = null;
    if (!press?.isDragging) return; // a plain click: let the link open the event

    suppressClickRef.current = true;
    setPreview(null);
    const target = positionFrom(pointer.clientX, pointer.clientY, press.grabOffsetMinutes);
    const targetDay = days[target.dayIndex];
    if (!targetDay) return;

    const newStart = targetDay.interval.start + target.startMinute * MINUTE_MS;
    if (newStart !== start) onMove(event, newStart, newStart + (end - start));
  };

  const timeRange = formatRange(start, end, timeZone);
  const height = Math.max((endMinute - startMinute) * MINUTE_HEIGHT_PX, MIN_EVENT_HEIGHT_PX);
  const tone = eventToneClass(event, currentUserId);

  return (
    <>
      <Link
        href={`/calendar/events/${event.id}`}
        // Keep the grid's scroll position when the modal opens.
        scroll={false}
        // Links are natively draggable; that would hijack the pointer events.
        draggable={false}
        aria-label={`${event.title}, ${timeRange}`}
        onClick={(click) => {
          if (!suppressClickRef.current) return;
          suppressClickRef.current = false;
          click.preventDefault();
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={cancelDrag}
        className={`absolute z-10 block touch-none overflow-hidden rounded border px-1.5 py-0.5 text-xs leading-tight select-none ${tone} ${
          segment.continuesBefore ? "rounded-t-none" : ""
        } ${segment.continuesAfter ? "rounded-b-none" : ""} ${canDrag ? "cursor-grab" : ""} ${
          isDragging ? "opacity-40" : ""
        }`}
        style={{
          top: startMinute * MINUTE_HEIGHT_PX,
          height,
          left: `calc(${(column / columnCount) * 100}% + 1px)`,
          width: `calc(${100 / columnCount}% - 2px)`,
        }}
      >
        <div className="truncate font-medium">{event.title}</div>
        {height > 2 * MIN_EVENT_HEIGHT_PX && <div className="truncate opacity-80">{timeRange}</div>}
      </Link>

      {preview && overlay && (
        <DragPreview
          event={event}
          preview={preview}
          days={days}
          durationMinutes={durationMinutes}
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
  durationMinutes,
  timeZone,
  tone,
  container,
}: {
  event: CalendarEvent;
  preview: DropPosition;
  days: WeekDayLayout[];
  durationMinutes: number;
  timeZone: string;
  tone: string;
  container: HTMLElement;
}) {
  const day = days[preview.dayIndex];
  if (!day) return null;

  const newStart = day.interval.start + preview.startMinute * MINUTE_MS;
  const top = Math.max(preview.startMinute, 0);
  const bottom = Math.min(preview.startMinute + durationMinutes, day.minutes);

  return createPortal(
    <div
      aria-hidden
      className={`absolute z-30 overflow-hidden rounded border-2 px-1.5 py-0.5 text-xs leading-tight shadow-lg ${tone}`}
      style={{
        left: `calc(${(preview.dayIndex / days.length) * 100}% + 2px)`,
        width: `calc(${100 / days.length}% - 4px)`,
        top: top * MINUTE_HEIGHT_PX,
        height: Math.max((bottom - top) * MINUTE_HEIGHT_PX, MIN_EVENT_HEIGHT_PX),
      }}
    >
      <div className="truncate font-medium">{event.title}</div>
      <div className="truncate">{formatRange(newStart, newStart + durationMinutes * MINUTE_MS, timeZone)}</div>
    </div>,
    container,
  );
}
