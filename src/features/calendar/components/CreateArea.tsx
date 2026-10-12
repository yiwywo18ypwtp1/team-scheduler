"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { formatInTimeZone } from "@/lib/time/zoned";
import { SNAP_MINUTES } from "../lib/drag";
import type { WeekDayLayout } from "../lib/week-layout";
import { MINUTE_HEIGHT_PX } from "./grid-constants";

const MINUTE_MS = 60 * 1000;
const CLICK_DURATION_MIN = 60;

type Props = {
  day: WeekDayLayout;
  timeZone: string;
  onCreate: (start: number, end: number) => void;
};

/**
 * The empty part of a day column: drag over it to select a time range and
 * create an event there (a plain click selects one hour). Escape cancels.
 * Selection state is local to this column, so the rest of the grid doesn't
 * re-render while selecting. Events sit above it (z-10), so they keep their
 * own pointer handling.
 */
export function CreateArea({ day, timeZone, onCreate }: Props) {
  const [selection, setSelection] = useState<{ from: number; to: number } | null>(null);
  const pressRef = useRef<{ anchor: number; moved: boolean } | null>(null);
  const selectionRef = useRef<{ from: number; to: number } | null>(null);

  const select = (next: { from: number; to: number } | null) => {
    const current = selectionRef.current;
    if (current && next && current.from === next.from && current.to === next.to) return;
    selectionRef.current = next;
    setSelection(next);
  };

  const minuteAt = (pointer: ReactPointerEvent<HTMLElement>) => {
    const rect = pointer.currentTarget.getBoundingClientRect();
    const minute = Math.floor((pointer.clientY - rect.top) / MINUTE_HEIGHT_PX / SNAP_MINUTES) * SNAP_MINUTES;
    return Math.min(Math.max(minute, 0), day.minutes - SNAP_MINUTES);
  };

  useEffect(() => {
    if (!selection) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      pressRef.current = null;
      select(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selection]);

  const top = selection ? selection.from * MINUTE_HEIGHT_PX : 0;
  const height = selection ? (selection.to - selection.from) * MINUTE_HEIGHT_PX : 0;

  return (
    <div
      aria-hidden
      data-create-area
      className="absolute inset-0 z-[5] cursor-cell touch-none"
      onPointerDown={(pointer) => {
        if (pointer.button !== 0) return;
        pointer.currentTarget.setPointerCapture(pointer.pointerId);
        const anchor = minuteAt(pointer);
        pressRef.current = { anchor, moved: false };
        select({ from: anchor, to: anchor + SNAP_MINUTES });
      }}
      onPointerMove={(pointer) => {
        const press = pressRef.current;
        if (!press) return;
        const minute = minuteAt(pointer);
        if (minute !== press.anchor) press.moved = true;
        select({ from: Math.min(press.anchor, minute), to: Math.max(press.anchor, minute) + SNAP_MINUTES });
      }}
      onPointerUp={() => {
        const press = pressRef.current;
        const range = selectionRef.current;
        pressRef.current = null;
        select(null);
        if (!press || !range) return;
        const to = press.moved ? range.to : Math.min(range.from + CLICK_DURATION_MIN, day.minutes);
        onCreate(day.interval.start + range.from * MINUTE_MS, day.interval.start + to * MINUTE_MS);
      }}
      onPointerCancel={() => {
        pressRef.current = null;
        select(null);
      }}
    >
      {selection && (
        <div
          className="absolute inset-x-1 rounded border-2 border-blue-500 bg-blue-500/20 px-1 text-[11px] text-blue-900 dark:text-blue-100"
          style={{ top, height }}
        >
          {formatInTimeZone(day.interval.start + selection.from * MINUTE_MS, timeZone, "HH:mm")}–
          {formatInTimeZone(day.interval.start + selection.to * MINUTE_MS, timeZone, "HH:mm")}
        </div>
      )}
    </div>
  );
}
