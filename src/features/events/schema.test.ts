import { describe, expect, it } from "vitest";
import { defaultRecurrence } from "@/lib/recurrence/rule";
import { eventFormSchema, formValuesToInterval, makeEventFormSchema, type EventFormValues } from "./schema";

const valid: EventFormValues = {
  title: "Planning",
  description: "",
  allDay: false,
  startDate: "2026-10-12",
  startTime: "10:00",
  endDate: "2026-10-12",
  endTime: "11:00",
  timezone: "Europe/Kyiv",
  attendeeIds: ["mem_01", "mem_02"],
  location: { kind: "none" },
  recurrence: defaultRecurrence(),
};

function errorsOf(values: unknown, schema = eventFormSchema) {
  const result = schema.safeParse(values);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path.join("."), issue.message]));
}

describe("eventFormSchema", () => {
  it("accepts valid values", () => {
    expect(errorsOf(valid)).toEqual({});
  });

  it("requires end after start", () => {
    expect(errorsOf({ ...valid, endTime: "10:00" })).toEqual({ endTime: "End must be after start" });
  });

  it("limits timed events to 24 hours but not all-day ones", () => {
    const twoDays = { ...valid, endDate: "2026-10-14" };
    expect(errorsOf(twoDays)).toEqual({ endTime: "Event can't be longer than 24 hours" });
    expect(errorsOf({ ...twoDays, allDay: true })).toEqual({});
  });

  it("allows a single-day all-day event and rejects an end date before start", () => {
    expect(errorsOf({ ...valid, allDay: true })).toEqual({});
    expect(errorsOf({ ...valid, allDay: true, endDate: "2026-10-11" })).toEqual({
      endDate: "End date must not be before start date",
    });
  });

  it("requires at least one attendee and a title", () => {
    expect(errorsOf({ ...valid, attendeeIds: [], title: "  " })).toEqual({
      title: "Title is required",
      attendeeIds: "Add at least one attendee",
    });
  });

  it("accepts only http(s) meeting links", () => {
    const withUrl = (url: string) => ({ ...valid, location: { kind: "url", url } });
    expect(errorsOf(withUrl("https://meet.example.com/abc"))).toEqual({});
    expect(errorsOf(withUrl("not a url"))).toHaveProperty(["location.url"]);
    expect(errorsOf(withUrl("javascript:alert(1)"))).toHaveProperty(["location.url"]);
  });

  it("reports field errors without throwing on invalid time and date", () => {
    expect(errorsOf({ ...valid, startTime: "25:00", endDate: "2026-02-30" })).toEqual({
      startTime: "Enter a valid time",
      endDate: "Enter a valid date",
    });
  });
});

describe("recurrence validation", () => {
  const repeat = (recurrence: Partial<EventFormValues["recurrence"]>) => ({
    ...valid,
    recurrence: { ...valid.recurrence, ...recurrence },
  });

  it("requires at least one weekday for weekly rules", () => {
    expect(errorsOf(repeat({ freq: "weekly", weekdays: [] }))).toEqual({ "recurrence.weekdays": "Pick at least one day" });
  });

  it("requires an end date on or after the start", () => {
    expect(errorsOf(repeat({ freq: "daily", end: "until", until: "" }))).toEqual({ "recurrence.until": "Enter a valid date" });
    expect(errorsOf(repeat({ freq: "daily", end: "until", until: "2026-10-11" }))).toEqual({
      "recurrence.until": "Must not be before the start date",
    });
    expect(errorsOf(repeat({ freq: "daily", end: "until", until: "2026-10-12" }))).toEqual({});
  });

  it("rejects an invalid custom rule and an interval below 1", () => {
    expect(errorsOf(repeat({ freq: "custom", custom: "FREQ=NOPE" }))).toEqual({ "recurrence.custom": "This repeat rule is not valid" });
    expect(errorsOf(repeat({ freq: "daily", interval: 0 }))).toEqual({ "recurrence.interval": "At least 1" });
  });
});

describe("makeEventFormSchema", () => {
  const schema = makeEventFormSchema([{ id: "room_small", capacity: 2 }]);

  it("checks room capacity against the attendee count", () => {
    const inRoom = { ...valid, location: { kind: "room", roomId: "room_small" } };
    expect(errorsOf(inRoom, schema)).toEqual({});
    expect(errorsOf({ ...inRoom, attendeeIds: ["a", "b", "c"] }, schema)).toEqual({
      "location.roomId": "Room fits 2, but there are 3 attendees",
    });
  });

  it("rejects unknown rooms", () => {
    expect(errorsOf({ ...valid, location: { kind: "room", roomId: "nope" } }, schema)).toEqual({
      "location.roomId": "Unknown room",
    });
  });
});

describe("formValuesToInterval", () => {
  it("resolves wall time in the event timezone", () => {
    expect(formValuesToInterval(valid)).toEqual({
      start: Date.parse("2026-10-12T07:00:00Z"),
      end: Date.parse("2026-10-12T08:00:00Z"),
    });
  });

  it("makes all-day events end at the midnight after the last day", () => {
    expect(formValuesToInterval({ ...valid, allDay: true, endDate: "2026-10-13" })).toEqual({
      start: Date.parse("2026-10-11T21:00:00Z"),
      end: Date.parse("2026-10-13T21:00:00Z"),
    });
  });
});
