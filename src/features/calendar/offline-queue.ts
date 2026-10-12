"use client";

import { useSyncExternalStore } from "react";
import { z } from "zod";

/**
 * Moves made while offline, kept in localStorage so they survive a reload
 * and are sent when the connection is back. Only drag/keyboard moves are
 * queued: they are small, idempotent per event and easy to show. Forms and
 * deletes still need the network and say so.
 */
const STORAGE_KEY = "team-scheduler:offline-moves";
const CHANGE_EVENT = "team-scheduler:offline-moves-changed";

const queuedMoveSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** Version the first queued move was based on; the server checks it on replay. */
  version: z.number(),
  start: z.number(),
  end: z.number(),
});
export type QueuedMove = z.infer<typeof queuedMoveSchema>;

/** A later move of the same event replaces the earlier one but keeps its base version. */
export function addMove(queue: QueuedMove[], move: QueuedMove): QueuedMove[] {
  const previous = queue.find((item) => item.id === move.id);
  const merged = previous ? { ...move, version: previous.version } : move;
  return [...queue.filter((item) => item.id !== move.id), merged];
}

export function parseQueue(raw: string | null): QueuedMove[] {
  try {
    const parsed = z.array(queuedMoveSchema).safeParse(JSON.parse(raw ?? "[]"));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function write(queue: QueuedMove[]) {
  try {
    if (queue.length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Storage blocked: the move stays only until the page is closed.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function readQueue(): QueuedMove[] {
  return parseQueue(readRaw());
}

export function enqueueMove(move: QueuedMove) {
  write(addMove(readQueue(), move));
}

export function removeMove(id: string) {
  write(readQueue().filter((item) => item.id !== id));
}

// Snapshot is the raw string, parsed once per change, so React sees a stable value.
let cache: { raw: string | null; queue: QueuedMove[] } = { raw: null, queue: [] };
function snapshot(): QueuedMove[] {
  const raw = readRaw();
  if (raw !== cache.raw) cache = { raw, queue: parseQueue(raw) };
  return cache.queue;
}
const EMPTY: QueuedMove[] = [];

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange); // other tabs
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useQueuedMoves(): QueuedMove[] {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}
