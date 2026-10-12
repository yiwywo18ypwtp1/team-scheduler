"use client";

import { useSyncExternalStore } from "react";
import { MINUTE_HEIGHT_PX } from "./grid-constants";

const MINUTE_MS = 60 * 1000;

function subscribe(onTick: () => void) {
  const id = setInterval(onTick, 15_000);
  return () => clearInterval(id);
}

// Rounded to the minute so the snapshot stays stable between ticks.
const getClientNow = () => Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;
// Nothing on the server: the line appears after hydration, avoiding a mismatch.
const getServerNow = () => null;

type Props = {
  /** UTC bounds of the day column. */
  dayStart: number;
  dayEnd: number;
  /** Frozen time from MOCK_NOW, passed from the server. */
  mockNow?: number;
};

/**
 * Current-time line. Its own client component with its own timer, so the
 * minute tick re-renders this line only, not the whole week grid.
 */
export function NowLine({ dayStart, dayEnd, mockNow }: Props) {
  const clientNow = useSyncExternalStore(subscribe, getClientNow, getServerNow);
  const now = mockNow ?? clientNow;
  if (now === null || now < dayStart || now >= dayEnd) return null;

  const top = ((now - dayStart) / MINUTE_MS) * MINUTE_HEIGHT_PX;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-red-500"
      style={{ top }}
    >
      <span className="absolute -left-1 -top-[5px] size-2 rounded-full bg-red-500" />
    </div>
  );
}
