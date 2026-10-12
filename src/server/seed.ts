import { occurrencesOf } from "@/lib/recurrence/expand";
import { isLastWeekdayOfMonth, nthWeekdayOf } from "@/lib/recurrence/rule";
import {
  addDaysToDateKey,
  dateKeyInTimeZone,
  toZonedIso,
  wallTimeToInstant,
  weekdayOfDateKey,
} from "@/lib/time/zoned";
import type {
  Attendee,
  AttendeeStatus,
  BookingPage,
  CalendarEvent,
  EventLocation,
  Member,
  Room,
  WorkingHours,
} from "@/types/domain";

// Pure and deterministic: the same `now` day always produces the same data.
// No `server-only` import, so it can be unit-tested directly.

export type SeedData = {
  members: Member[];
  rooms: Room[];
  events: CalendarEvent[];
  bookingPages: BookingPage[];
};

/** Rows in the events table: single events, series masters and moved occurrences. */
const EVENT_COUNT = 5000;
const SERIES_COUNT = 300;
/** Events are spread over roughly half a year around "now". */
const DAYS_BEFORE_NOW = 90;
const DAYS_AFTER_NOW = 90;

const MINUTE_MS = 60 * 1000;
const SLOT_MS = 15 * MINUTE_MS;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const SEED_TIME_ZONES = [
  "Europe/Kyiv",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Pacific/Auckland",
  "America/Sao_Paulo",
] as const;

const NAMES = [
  "Olena Kovalenko", "James Walker", "Maria Garcia", "Ethan Brooks", "Priya Sharma",
  "Haruto Sato", "Aroha Ngata", "Lucas Oliveira", "Taras Shevchuk", "Emily Clarke",
  "Daniel Kim", "Sofia Martinez", "Arjun Mehta", "Yui Tanaka", "Liam Wilson",
  "Beatriz Santos", "Iryna Bondar", "Oliver Hughes", "Grace Lee", "Noah Johnson",
  "Ananya Iyer", "Ren Watanabe", "Mia Thompson", "Gabriel Costa", "Andrii Melnyk",
  "Charlotte Evans", "Michael Chen", "Ava Robinson", "Vikram Rao", "Sakura Ito",
] as const;

const WORKING_SHIFTS = [
  { from: "09:00", to: "17:00" },
  { from: "08:00", to: "16:00" },
  { from: "10:00", to: "18:00" },
] as const;

const ROOMS: Room[] = [
  { id: "room_1", name: "Focus", capacity: 4 },
  { id: "room_2", name: "Harbor", capacity: 6 },
  { id: "room_3", name: "Atlas", capacity: 8 },
  { id: "room_4", name: "Summit", capacity: 12 },
  { id: "room_5", name: "Auditorium", capacity: 20 },
];

const TITLES = [
  "Standup", "1:1", "Design review", "Sprint planning", "Retro", "Customer call",
  "Hiring interview", "Architecture sync", "Roadmap review", "Pairing session",
  "Demo prep", "Incident review", "Budget sync", "Onboarding", "Lunch & learn",
];
const ALL_DAY_TITLES = ["Conference", "Offsite", "Vacation", "Public holiday", "Hackathon"];
const DESCRIPTIONS = [
  "Agenda in the shared doc.",
  "Please come prepared with updates.",
  "Recording will be shared afterwards.",
  "Bring questions from the last sprint.",
];
const DURATIONS_MIN = [30, 30, 45, 60, 60, 60, 90, 120];
const OTHER_STATUSES: AttendeeStatus[] = ["accepted", "accepted", "tentative", "pending", "declined"];
const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
const SERIES_TEMPLATES = [
  { title: "Daily standup", minutes: 15, rule: () => "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" },
  { title: "Weekly 1:1", minutes: 30, rule: (date: string) => `FREQ=WEEKLY;BYDAY=${DAY_CODES[weekdayOfDateKey(date)]}` },
  { title: "Team sync", minutes: 60, rule: (date: string) => `FREQ=WEEKLY;INTERVAL=2;BYDAY=${DAY_CODES[weekdayOfDateKey(date)]}` },
  { title: "Focus block", minutes: 90, rule: () => "FREQ=WEEKLY;BYDAY=TU,TH" },
  {
    title: "Monthly review",
    minutes: 60,
    rule: (date: string) =>
      `FREQ=MONTHLY;BYDAY=${isLastWeekdayOfMonth(date) ? "-1" : nthWeekdayOf(date)}${DAY_CODES[weekdayOfDateKey(date)]}`,
  },
  { title: "Monthly planning", minutes: 45, rule: (date: string) => `FREQ=MONTHLY;BYMONTHDAY=${Number(date.slice(8))}` },
] as const;

/** mulberry32: tiny seeded PRNG, so the seed is reproducible across processes. */
function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSeedData(now: number): SeedData {
  const random = createRandom(20261012);
  const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const chance = (probability: number) => random() < probability;
  const pick = <T>(items: readonly T[]): T => {
    const item = items[Math.floor(random() * items.length)];
    if (item === undefined) throw new Error("Cannot pick from an empty list");
    return item;
  };

  const members: Member[] = NAMES.map((name, index) => {
    const shift = pick(WORKING_SHIFTS);
    const workingHours: WorkingHours[] = ([1, 2, 3, 4, 5] as const).map((weekday) => ({
      weekday,
      ...shift,
    }));
    return {
      id: `mem_${String(index + 1).padStart(2, "0")}`,
      name,
      email: `${name.toLowerCase().replace(" ", ".")}@example.com`,
      timezone: SEED_TIME_ZONES[index % SEED_TIME_ZONES.length] ?? "UTC",
      workingHours,
    };
  });

  const pickAttendees = (organizer: Member): Attendee[] => {
    const count = int(0, 4);
    const others: Member[] = [];
    while (others.length < count) {
      const member = pick(members);
      if (member.id !== organizer.id && !others.includes(member)) others.push(member);
    }
    return [
      { memberId: organizer.id, status: "accepted" },
      ...others.map((member) => ({ memberId: member.id, status: pick(OTHER_STATUSES) })),
    ];
  };

  const pickLocation = (id: string, attendeeCount: number): EventLocation | undefined => {
    if (chance(0.5)) {
      const fitting = ROOMS.filter((room) => room.capacity >= attendeeCount);
      return { kind: "room", roomId: pick(fitting).id };
    }
    return chance(0.6) ? { kind: "url", url: `https://meet.example.com/${id}` } : undefined;
  };

  const today = dateKeyInTimeZone(now, "UTC");
  const events: CalendarEvent[] = [];
  const nextId = () => `evt_${String(events.length + 1).padStart(4, "0")}`;

  // Recurring series first: masters with RRULEs, some exdates, some occurrences
  // moved to another time (exdate on the master + a single event with seriesId).
  let seriesCount = 0;
  while (seriesCount < SERIES_COUNT) {
    const organizer = pick(members);
    const timeZone = organizer.timezone;
    const date = addDaysToDateKey(today, int(-DAYS_BEFORE_NOW, 30));
    const shift = organizer.workingHours.find((rule) => rule.weekday === weekdayOfDateKey(date));
    if (!shift) continue;

    const template = pick(SERIES_TEMPLATES);
    const workStart = wallTimeToInstant(date, shift.from, timeZone);
    const start = workStart + int(0, 10) * SLOT_MS;
    const endRoll = random();
    const ending =
      endRoll < 0.2 ? `;COUNT=${int(5, 20)}` : endRoll < 0.4 ? `;UNTIL=${addDaysToDateKey(date, int(30, 120)).replace(/-/g, "")}T235959Z` : "";

    const id = nextId();
    const attendees = pickAttendees(organizer);
    const master: CalendarEvent = {
      id,
      title: template.title,
      start: toZonedIso(start, timeZone),
      end: toZonedIso(start + template.minutes * MINUTE_MS, timeZone),
      timezone: timeZone,
      allDay: false,
      rrule: template.rule(date) + ending,
      attendees,
      location: pickLocation(id, attendees.length),
      version: 1,
    };

    const firstOccurrences = occurrencesOf(master, { start, end: start + 60 * DAY_MS }, 8);
    const exdates: string[] = [];
    if (chance(0.35) && firstOccurrences.length > 2) {
      const skipped = firstOccurrences[int(1, firstOccurrences.length - 1)];
      if (skipped) exdates.push(toZonedIso(skipped.start, timeZone));
    }
    const moved = chance(0.2) && firstOccurrences.length > 3 ? firstOccurrences[int(1, firstOccurrences.length - 1)] : undefined;
    if (moved && !exdates.includes(toZonedIso(moved.start, timeZone))) {
      exdates.push(toZonedIso(moved.start, timeZone));
    }
    events.push(exdates.length > 0 ? { ...master, exdates } : master);

    if (moved && exdates.includes(toZonedIso(moved.start, timeZone))) {
      const shiftMs = pick([60, 120, 24 * 60]) * MINUTE_MS;
      events.push({
        ...master,
        id: nextId(),
        seriesId: master.id,
        rrule: undefined,
        title: `${master.title} (moved)`,
        start: toZonedIso(moved.start + shiftMs, timeZone),
        end: toZonedIso(moved.end + shiftMs, timeZone),
      });
    }
    seriesCount++;
  }

  while (events.length < EVENT_COUNT) {
    const organizer = pick(members);
    const timeZone = organizer.timezone;
    const date = addDaysToDateKey(today, int(-DAYS_BEFORE_NOW, DAYS_AFTER_NOW - 1));
    const shift = organizer.workingHours.find((rule) => rule.weekday === weekdayOfDateKey(date));
    if (!shift) continue; // weekend for the organizer

    const id = nextId();
    const workStart = wallTimeToInstant(date, shift.from, timeZone);
    const workEnd = wallTimeToInstant(date, shift.to, timeZone);
    const roll = random();

    if (roll < 0.03) {
      // All-day, 1-3 days. `end` is exclusive: midnight after the last day.
      const days = int(1, 3);
      events.push({
        id,
        title: pick(ALL_DAY_TITLES),
        start: toZonedIso(wallTimeToInstant(date, "00:00", timeZone), timeZone),
        end: toZonedIso(wallTimeToInstant(addDaysToDateKey(date, days), "00:00", timeZone), timeZone),
        timezone: timeZone,
        allDay: true,
        attendees: pickAttendees(organizer),
        version: 1,
      });
      continue;
    }

    let start: number;
    let end: number;
    if (roll < 0.04) {
      // Timed event spanning several days, e.g. a workshop.
      start = workStart;
      end = wallTimeToInstant(addDaysToDateKey(date, int(1, 2)), shift.to, timeZone);
    } else {
      const duration = pick(DURATIONS_MIN) * MINUTE_MS;
      const slotCount = Math.floor((workEnd - duration - workStart) / SLOT_MS);
      start = workStart + int(0, slotCount) * SLOT_MS;
      end = start + duration;
    }

    const attendees = pickAttendees(organizer);
    events.push({
      id,
      title: pick(TITLES),
      description: chance(0.3) ? pick(DESCRIPTIONS) : undefined,
      start: toZonedIso(start, timeZone),
      end: toZonedIso(end, timeZone),
      timezone: timeZone,
      allDay: false,
      attendees,
      location: pickLocation(id, attendees.length),
      version: 1,
    });
  }

  const fixedQuestions: BookingPage["questions"] = [
    { id: "q_name", kind: "text", label: "Your name", required: true, maxLength: 100 },
    { id: "q_email", kind: "email", label: "Email", required: true },
    { id: "q_notes", kind: "text", label: "What would you like to discuss?", required: false, maxLength: 1000 },
  ];

  const bookingPages: BookingPage[] = [
    {
      slug: "intro-call",
      title: "Intro call",
      ownerId: "mem_03", // America/New_York
      durationOptions: [30, 60],
      bufferBefore: 10,
      bufferAfter: 10,
      minNotice: 24 * 60,
      horizonDays: 30,
      questions: fixedQuestions,
    },
    {
      slug: "team-sync",
      title: "Quick sync",
      ownerId: "mem_01", // Europe/Kyiv
      durationOptions: [15, 30],
      bufferBefore: 0,
      bufferAfter: 5,
      minNotice: 60,
      horizonDays: 14,
      questions: fixedQuestions,
    },
  ];

  return { members, rooms: ROOMS, events, bookingPages };
}
