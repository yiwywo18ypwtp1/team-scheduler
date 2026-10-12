import "server-only";
import { findConflicts } from "@/lib/availability";
import type { Interval } from "@/lib/intervals";
import { listEvents } from "./events";
import { listMembers } from "./members";
import { listRooms } from "./rooms";

/** Conflicts with names attached, for display. */
export function getConflicts(query: {
  interval: Interval;
  memberIds: string[];
  roomId?: string;
  ignoreEventId?: string;
}) {
  const events = listEvents({ ...query.interval });
  const names = new Map([
    ...listMembers().map((member) => [member.id, member.name] as const),
    ...listRooms().map((room) => [room.id, room.name] as const),
  ]);
  return findConflicts(events, query).map((conflict) => ({
    ...conflict,
    name: names.get(conflict.kind === "member" ? conflict.memberId : conflict.roomId) ?? "Unknown",
  }));
}
