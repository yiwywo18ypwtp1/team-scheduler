// Domain model from the task spec (section 1). Plain types, importable from
// both server and client code. Input/form types are derived from zod schemas
// in the corresponding feature folders instead of being declared here.

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type WorkingHours = {
  weekday: Weekday;
  /** "HH:mm" wall time in the member's own timezone */
  from: string;
  to: string;
};

export type Member = {
  id: string;
  name: string;
  email: string;
  /** IANA timezone, e.g. "Europe/Kyiv" */
  timezone: string;
  avatarUrl?: string;
  workingHours: WorkingHours[];
};

export type AttendeeStatus = "accepted" | "declined" | "tentative" | "pending";

export type Attendee = {
  memberId: string;
  status: AttendeeStatus;
};

export type EventLocation =
  | { kind: "room"; roomId: string }
  | { kind: "url"; url: string };

export type CalendarEvent = {
  id: string;
  /** Present on instances of a recurring series */
  seriesId?: string;
  title: string;
  description?: string;
  /** ISO 8601 with offset */
  start: string;
  end: string;
  /** IANA timezone the event was created in */
  timezone: string;
  allDay: boolean;
  /** Only on the series master */
  rrule?: string;
  /** Deleted instances of a series */
  exdates?: string[];
  attendees: Attendee[];
  location?: EventLocation;
  version: number;
};

export type Room = {
  id: string;
  name: string;
  capacity: number;
};

export type QuestionBase = {
  id: string;
  label: string;
  required: boolean;
};

export type Question =
  | (QuestionBase & { kind: "text"; maxLength: number })
  | (QuestionBase & { kind: "email" })
  | (QuestionBase & { kind: "select"; options: string[]; multiple: boolean })
  | (QuestionBase & { kind: "number"; min?: number; max?: number })
  | (QuestionBase & { kind: "checkbox" })
  | (QuestionBase & { kind: "phone"; defaultCountry: string });

export type BookingPage = {
  slug: string;
  title: string;
  ownerId: string;
  /** Minutes */
  durationOptions: number[];
  bufferBefore: number;
  bufferAfter: number;
  /** Minutes before start after which booking is no longer allowed */
  minNotice: number;
  horizonDays: number;
  questions: Question[];
};

/**
 * A guest's booking made on a public booking page. Not part of the spec's
 * model; it links the created calendar event to the guest's answers and the
 * secret token that guards the confirmation, .ics and cancel links.
 */
export type Booking = {
  id: string;
  slug: string;
  eventId: string;
  /** ISO with offset, in the owner's timezone (same as the event). */
  start: string;
  end: string;
  guestTimeZone: string;
  answers: { name: string; email: string; notes: string };
  status: "confirmed" | "cancelled";
  createdAt: string;
  cancelToken: string;
};
