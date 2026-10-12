import "server-only";
import { busyIntervalsFor, findCommonWindows, roomBusyIntervals } from "@/lib/availability";
import { DomainError } from "@/lib/errors";
import { intersectIntervals, type Interval } from "@/lib/intervals";
import { workingIntervals } from "@/lib/time/working-hours";
import { searchRange, type FindTimeQuery } from "@/features/find-time/schema";
import type { Member, Room } from "@/types/domain";
import { listEvents } from "./events";
import { getMember } from "./members";
import { listRooms } from "./rooms";

export type MemberAvailability = {
  member: Pick<Member, "id" | "name" | "timezone">;
  working: Interval[];
  busy: Interval[];
};

export type AvailabilityResult = {
  range: Interval;
  members: MemberAvailability[];
  room?: { room: Room; busy: Interval[] };
  /** Times when everyone (and the room) is free, at least `duration` long. */
  windows: Interval[];
};

/**
 * Reads the schedules from the database and hands them to the pure
 * `findCommonWindows`. Returns the per-member data too, for the timeline.
 */
export function getAvailability(query: FindTimeQuery): AvailabilityResult {
  const range = searchRange(query);

  const members = query.memberIds.map((id) => {
    const member = getMember(id);
    if (!member) {
      throw new DomainError("VALIDATION_ERROR", "Some fields are invalid", {
        memberIds: [`This member no longer exists: ${id}`],
      });
    }
    return member;
  });

  const room = query.roomId ? listRooms().find((candidate) => candidate.id === query.roomId) : undefined;
  if (query.roomId && !room) {
    throw new DomainError("VALIDATION_ERROR", "Some fields are invalid", { roomId: ["Unknown room"] });
  }
  if (room && room.capacity < members.length) {
    throw new DomainError("VALIDATION_ERROR", "Some fields are invalid", {
      roomId: [`${room.name} fits ${room.capacity}, but ${members.length} people are invited`],
    });
  }

  const events = listEvents({ ...range, memberIds: query.memberIds });
  const schedules = members.map((member) => ({
    member,
    workingHours: member.workingHours,
    timeZone: member.timezone,
    busy: intersectIntervals(busyIntervalsFor(events, member.id), [range]),
  }));
  const roomBusy = room
    ? intersectIntervals(roomBusyIntervals(listEvents({ ...range, roomId: room.id }), room.id), [range])
    : [];

  return {
    range,
    members: schedules.map(({ member, workingHours, timeZone, busy }) => ({
      member: { id: member.id, name: member.name, timezone: member.timezone },
      working: workingIntervals(workingHours, timeZone, range),
      busy,
    })),
    room: room ? { room, busy: roomBusy } : undefined,
    windows: findCommonWindows({
      schedules,
      extraBusy: roomBusy,
      range,
      minDurationMs: query.duration * 60 * 1000,
    }),
  };
}
