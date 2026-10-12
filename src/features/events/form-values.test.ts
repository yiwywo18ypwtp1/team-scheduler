import { describe, expect, it } from "vitest";
import { makeEvent } from "@/test/factories";
import { eventToFormValues, formValuesToEventFields, newEventFormValues } from "./form-values";

describe("eventToFormValues / formValuesToEventFields", () => {
  it("round-trips a timed event in its own timezone", () => {
    const event = makeEvent({
      id: "e1",
      title: "Sync",
      start: "2026-10-12T10:00:00+03:00",
      end: "2026-10-12T11:30:00+03:00",
      timezone: "Europe/Kyiv",
      location: { kind: "url", url: "https://meet.example.com/x" },
    });

    const values = eventToFormValues(event);
    expect(values).toMatchObject({
      startDate: "2026-10-12",
      startTime: "10:00",
      endTime: "11:30",
      attendeeIds: ["mem_01"],
    });
    expect(formValuesToEventFields(values)).toMatchObject({
      start: event.start,
      end: event.end,
      location: event.location,
    });
  });

  it("shows the inclusive last day for all-day events and stores the exclusive end", () => {
    const event = makeEvent({
      id: "e2",
      start: "2026-10-12T00:00:00+03:00",
      end: "2026-10-14T00:00:00+03:00",
      timezone: "Europe/Kyiv",
      allDay: true,
    });
    const values = eventToFormValues(event);
    expect(values).toMatchObject({ startDate: "2026-10-12", endDate: "2026-10-13" });
    expect(formValuesToEventFields(values)).toMatchObject({ start: event.start, end: event.end });
  });

  it("maps 'none' location to no location and trims text", () => {
    const fields = formValuesToEventFields({
      ...eventToFormValues(makeEvent({ id: "e3", start: "2026-10-12T10:00:00Z", end: "2026-10-12T11:00:00Z" })),
      title: "  Retro  ",
      description: "   ",
    });
    expect(fields).toMatchObject({ title: "Retro", description: undefined, location: undefined });
  });

  it("keeps the offset that is valid at each instant across DST", () => {
    const values = {
      ...eventToFormValues(makeEvent({ id: "e4", start: "2026-10-24T10:00:00Z", end: "2026-10-24T11:00:00Z" })),
      startDate: "2026-10-24",
      startTime: "23:30",
      endDate: "2026-10-25",
      endTime: "03:30",
      timezone: "Europe/Kyiv",
    };
    // Both 03:30s exist on Oct 25; the earlier one (summer time) is used.
    expect(formValuesToEventFields(values)).toMatchObject({
      start: "2026-10-24T23:30:00+03:00",
      end: "2026-10-25T03:30:00+03:00",
    });
  });
});

describe("newEventFormValues", () => {
  const base = { now: Date.parse("2026-10-12T07:10:00Z"), timeZone: "Europe/Kyiv", currentUserId: "mem_01" };

  it("defaults to the next half hour for one hour with the current user", () => {
    expect(newEventFormValues(base)).toMatchObject({
      startDate: "2026-10-12",
      startTime: "10:30",
      endTime: "11:30",
      timezone: "Europe/Kyiv",
      attendeeIds: ["mem_01"],
    });
  });

  it("applies a valid prefill from the URL", () => {
    const values = newEventFormValues({
      ...base,
      prefill: {
        start: "2026-10-20T20:00:00Z",
        end: "2026-10-20T21:00:00Z",
        tz: "America/Los_Angeles",
        attendees: "mem_05,mem_01,mem_07",
      },
    });
    expect(values).toMatchObject({
      startDate: "2026-10-20",
      startTime: "13:00",
      endTime: "14:00",
      timezone: "America/Los_Angeles",
      attendeeIds: ["mem_01", "mem_05", "mem_07"],
    });
  });

  it("ignores an invalid prefill", () => {
    const values = newEventFormValues({ ...base, prefill: { start: "garbage", tz: "Mars/Base" } });
    expect(values).toMatchObject({ startTime: "10:30", timezone: "Europe/Kyiv" });
  });
});
