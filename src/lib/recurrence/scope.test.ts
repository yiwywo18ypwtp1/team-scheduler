import { describe, expect, it } from "vitest";
import { DomainError } from "@/lib/errors";
import { formatInTimeZone } from "@/lib/time/zoned";
import { makeEvent } from "@/test/factories";
import type { CalendarEvent } from "@/types/domain";
import { expandEvent } from "./expand";
import { planSeriesDelete, planSeriesUpdate, type EventChanges, type SeriesPlan } from "./scope";

const KYIV = "Europe/Kyiv";
const YEAR = { start: Date.parse("2026-01-01T00:00:00Z"), end: Date.parse("2027-12-31T00:00:00Z") };

// Daily 10:00-11:00 Kyiv from Mon Oct 12, 2026, 6 times: Oct 12..17.
const master = makeEvent({
  id: "m",
  title: "Standup",
  start: "2026-10-12T10:00:00+03:00",
  end: "2026-10-12T11:00:00+03:00",
  timezone: KYIV,
  rrule: "FREQ=DAILY;COUNT=6",
  version: 3,
});
const at = (day: number, time = "10:00") => Date.parse(`2026-10-${day}T${time}:00+03:00`);

function changesFor(start: number, overrides: Partial<EventChanges> = {}): EventChanges {
  return {
    title: master.title,
    description: undefined,
    start: formatInTimeZone(start, KYIV, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    end: formatInTimeZone(start + 60 * 60 * 1000, KYIV, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    timezone: KYIV,
    allDay: false,
    location: undefined,
    rrule: master.rrule,
    attendees: master.attendees,
    ...overrides,
  };
}

let counter = 0;
const newId = () => `new${++counter}`;
const same = { newId, ruleChanged: false };

/** Applies a plan to a list of stored events and returns what the calendar shows. */
function shown(stored: CalendarEvent[], plan: SeriesPlan): string[] {
  const byId = new Map(stored.map((event) => [event.id, event]));
  for (const event of plan.upsert) byId.set(event.id, event);
  for (const id of plan.remove) byId.delete(id);
  return [...byId.values()]
    .flatMap((event) => expandEvent(event, YEAR))
    .map((event) => `${formatInTimeZone(Date.parse(event.start), KYIV, "MM-dd HH:mm")} ${event.title}`)
    .sort();
}

const state = (occurrenceDay: number, exceptions: CalendarEvent[] = [], m = master) => ({
  master: m,
  exceptions,
  occurrenceStart: at(occurrenceDay),
});

describe("planSeriesUpdate", () => {
  it("'this' hides one occurrence and stores the edited copy", () => {
    const plan = planSeriesUpdate(state(14), changesFor(at(14, "15:00"), { title: "Moved" }), "this", same);
    expect(plan.result).toMatchObject({ seriesId: "m", rrule: undefined, title: "Moved" });
    expect(shown([master], plan)).toEqual([
      "10-12 10:00 Standup",
      "10-13 10:00 Standup",
      "10-14 15:00 Moved",
      "10-15 10:00 Standup",
      "10-16 10:00 Standup",
      "10-17 10:00 Standup",
    ]);
  });

  it("'this' can't change the repeat rule", () => {
    expect(() =>
      planSeriesUpdate(state(14), changesFor(at(14), { rrule: "FREQ=WEEKLY" }), "this", { newId, ruleChanged: true }),
    ).toThrow(DomainError);
  });

  it("'this' can move an occurrence to another day without changing the rule", () => {
    const plan = planSeriesUpdate(state(14), changesFor(at(15, "09:00")), "this", same);
    expect(shown([master], plan)).toContain("10-15 09:00 Standup");
    expect(shown([master], plan)).not.toContain("10-14 10:00 Standup");
  });

  it("'following' splits the series and keeps the total count", () => {
    const plan = planSeriesUpdate(state(14), changesFor(at(14, "09:00"), { title: "Earlier" }), "following", same);
    expect(shown([master], plan)).toEqual([
      "10-12 10:00 Standup",
      "10-13 10:00 Standup",
      "10-14 09:00 Earlier",
      "10-15 09:00 Earlier",
      "10-16 09:00 Earlier",
      "10-17 09:00 Earlier",
    ]);
    const [oldMaster, newMaster] = plan.upsert;
    expect(oldMaster?.rrule).toBe("FREQ=DAILY;UNTIL=20261013T235959Z");
    expect(newMaster?.rrule).toBe("FREQ=DAILY;COUNT=4");
  });

  it("'following' moves later exdates and moved occurrences to the new series", () => {
    const withExceptions = { ...master, exdates: ["2026-10-13T10:00:00+03:00", "2026-10-16T10:00:00+03:00"] };
    const movedOccurrence = makeEvent({ id: "x", seriesId: "m", title: "Standup (moved)", start: "2026-10-15T18:00:00+03:00", end: "2026-10-15T19:00:00+03:00" });
    const plan = planSeriesUpdate(state(14, [movedOccurrence], withExceptions), changesFor(at(14, "09:00")), "following", same);

    const [oldMaster, newMaster, reassigned] = plan.upsert;
    expect(oldMaster?.exdates).toEqual(["2026-10-13T10:00:00+03:00"]);
    // Shifted with the series, so the same occurrence stays hidden.
    expect(newMaster?.exdates).toEqual(["2026-10-16T09:00:00+03:00"]);
    expect(reassigned).toMatchObject({ id: "x", seriesId: newMaster?.id });
    expect(shown([withExceptions, movedOccurrence], plan)).not.toContain("10-16 09:00 Standup");
  });

  it("'following' on the first occurrence changes the whole series (no empty old series)", () => {
    const plan = planSeriesUpdate(state(12), changesFor(at(12, "11:00")), "following", same);
    expect(plan.upsert).toHaveLength(1);
    expect(plan.upsert[0]?.id).toBe("m");
    expect(shown([master], plan).every((line) => line.includes("11:00"))).toBe(true);
  });

  it("'all' moves every occurrence by the same wall-clock delta, from any occurrence", () => {
    const withExdate = { ...master, exdates: ["2026-10-15T10:00:00+03:00"] };
    const plan = planSeriesUpdate(state(14, [], withExdate), changesFor(at(14, "11:30")), "all", same);
    expect(plan.result).toMatchObject({ id: "m", start: "2026-10-12T11:30:00+03:00", version: 4 });
    expect(shown([withExdate], plan)).toEqual([
      "10-12 11:30 Standup",
      "10-13 11:30 Standup",
      "10-14 11:30 Standup",
      "10-16 11:30 Standup",
      "10-17 11:30 Standup",
    ]);
  });

  it("'all' keeps local time across DST", () => {
    const daily = { ...master, start: "2026-10-23T10:00:00+03:00", end: "2026-10-23T11:00:00+03:00", rrule: "FREQ=DAILY;COUNT=4" };
    const plan = planSeriesUpdate(
      { master: daily, exceptions: [], occurrenceStart: Date.parse("2026-10-26T10:00:00+02:00") },
      changesFor(Date.parse("2026-10-26T12:00:00+02:00"), { rrule: daily.rrule }),
      "all",
      same,
    );
    expect(shown([daily], plan)).toEqual([
      "10-23 12:00 Standup",
      "10-24 12:00 Standup",
      "10-25 12:00 Standup",
      "10-26 12:00 Standup",
    ]);
  });
});

describe("planSeriesDelete", () => {
  const moved = makeEvent({ id: "x", seriesId: "m", title: "Moved", start: "2026-10-16T18:00:00+03:00", end: "2026-10-16T19:00:00+03:00" });

  it("'this' adds an exdate", () => {
    expect(shown([master], planSeriesDelete(state(13), "this"))).not.toContain("10-13 10:00 Standup");
    expect(shown([master], planSeriesDelete(state(13), "this"))).toHaveLength(5);
  });

  it("'following' ends the series and removes later moved occurrences", () => {
    const plan = planSeriesDelete(state(15, [moved]), "following");
    expect(plan.remove).toEqual(["x"]);
    expect(shown([master, moved], plan)).toEqual(["10-12 10:00 Standup", "10-13 10:00 Standup", "10-14 10:00 Standup"]);
  });

  it("'following' on the first occurrence and 'all' remove everything", () => {
    for (const plan of [planSeriesDelete(state(12, [moved]), "following"), planSeriesDelete(state(15, [moved]), "all")]) {
      expect(plan.remove.sort()).toEqual(["m", "x"]);
    }
  });
});
