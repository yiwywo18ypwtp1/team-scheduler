import { DomainError } from "@/lib/errors";
import {
  addDaysToDateKey,
  dateKeyInTimeZone,
  floatingToInstant,
  instantToFloating,
  toZonedIso,
} from "@/lib/time/zoned";
import type { CalendarEvent } from "@/types/domain";
import { occurrencesOf } from "./expand";
import { rruleCount, withRRuleEnd } from "./rule";

/** Which occurrences of a series an edit or delete applies to. */
export type SeriesScope = "this" | "following" | "all";
export const SERIES_SCOPES: readonly SeriesScope[] = ["this", "following", "all"];

/** New field values for the edited occurrence (rrule = the rule from the form). */
export type EventChanges = Pick<
  CalendarEvent,
  "title" | "description" | "start" | "end" | "timezone" | "allDay" | "location" | "rrule" | "attendees"
>;

type SeriesState = {
  master: CalendarEvent;
  /** Stored events with `seriesId === master.id` (moved occurrences). */
  exceptions: CalendarEvent[];
  /** Original start of the occurrence the user acted on. */
  occurrenceStart: number;
};

/**
 * What to write: events to insert or replace (by id), ids to delete, and the
 * event the user ends up looking at. The server applies it in one transaction.
 */
export type SeriesPlan = { upsert: CalendarEvent[]; remove: string[]; result: CalendarEvent | null };

const iso = (instant: number, timeZone: string) => toZonedIso(instant, timeZone);

/** The occurrence is the first one the series still shows (earlier ones may be exdates). */
function isFirstOccurrence({ master, occurrenceStart }: SeriesState): boolean {
  return occurrencesOf(master, { start: Date.parse(master.start), end: occurrenceStart }).length === 0;
}

/**
 * The master's rule ending the day before the occurrence. The editor supports
 * at most one occurrence per day, so "until the previous day" keeps every
 * occurrence before it and none after.
 */
function rruleEndingBefore(master: CalendarEvent, occurrenceStart: number): string {
  const occurrenceDay = dateKeyInTimeZone(occurrenceStart, master.timezone);
  return withRRuleEnd(master.rrule ?? "", { until: addDaysToDateKey(occurrenceDay, -1) });
}

/** Shifts an instant by a wall-clock delta, so 10:00 + 1 h is 11:00 local even across DST. */
function shiftWallClock(instant: number, deltaMs: number, timeZone: string): number {
  return floatingToInstant(instantToFloating(instant, timeZone) + deltaMs, timeZone);
}

/**
 * `ruleChanged`: whether the user edited the repeat rule itself. It is
 * decided by the caller against the occurrence's original date, because the
 * serialized rule also depends on the start date (weekday, day of month):
 * moving one occurrence to another day must not count as a rule change.
 */
export function planSeriesUpdate(
  state: SeriesState,
  changes: EventChanges,
  scope: SeriesScope,
  { newId, ruleChanged }: { newId: () => string; ruleChanged: boolean },
): SeriesPlan {
  const { master, exceptions, occurrenceStart } = state;

  if (scope === "this") {
    if (ruleChanged) {
      throw new DomainError("VALIDATION_ERROR", "Some fields are invalid", {
        "recurrence.freq": ["To change how the event repeats, apply it to this and following events or all events"],
      });
    }
    // Hide the occurrence in the series and store the edited copy as its own event.
    const exception: CalendarEvent = { ...changes, id: newId(), seriesId: master.id, rrule: undefined, version: 1 };
    const updatedMaster: CalendarEvent = {
      ...master,
      exdates: [...(master.exdates ?? []), iso(occurrenceStart, master.timezone)],
      version: master.version + 1,
    };
    return { upsert: [updatedMaster, exception], remove: [], result: exception };
  }

  const timeZone = changes.timezone;
  // How far the user moved the occurrence, in wall-clock time.
  const delta =
    instantToFloating(Date.parse(changes.start), timeZone) - instantToFloating(occurrenceStart, master.timezone);
  const shift = (instant: number) => shiftWallClock(instant, delta, timeZone);

  if (scope === "all" || isFirstOccurrence(state)) {
    // Move the whole series by the same wall-clock delta, exdates included.
    const masterStart = shift(Date.parse(master.start));
    const duration = Date.parse(changes.end) - Date.parse(changes.start);
    const updatedMaster: CalendarEvent = {
      ...master,
      ...changes,
      start: iso(masterStart, timeZone),
      end: iso(masterStart + duration, timeZone),
      exdates: master.exdates?.map((exdate) => iso(shift(Date.parse(exdate)), timeZone)),
      version: master.version + 1,
    };
    return { upsert: [updatedMaster], remove: [], result: updatedMaster };
  }

  // "This and following": end the old series before the occurrence and start
  // a new series from it. Later exdates and moved occurrences go to the new one.
  // With an unchanged rule, the new series continues the old one, so a COUNT
  // shrinks by the occurrences already used (exdates included, RFC 5545).
  // `changes.rrule` is used rather than the master's rule, because the caller
  // may have shifted weekdays when the occurrence moved to another day.
  let newRule = changes.rrule;
  const count = master.rrule ? rruleCount(master.rrule) : undefined;
  if (!ruleChanged && changes.rrule && count !== undefined) {
    const before = occurrencesOf(
      { ...master, exdates: [] },
      { start: Date.parse(master.start), end: occurrenceStart },
    ).length;
    newRule = withRRuleEnd(changes.rrule, { count: Math.max(count - before, 1) });
  }

  const newMaster: CalendarEvent = {
    ...master,
    ...changes,
    id: newId(),
    seriesId: undefined,
    rrule: newRule,
    exdates: master.exdates
      ?.filter((exdate) => Date.parse(exdate) >= occurrenceStart)
      .map((exdate) => iso(shift(Date.parse(exdate)), timeZone)),
    version: 1,
  };
  const oldMaster: CalendarEvent = {
    ...master,
    rrule: rruleEndingBefore(master, occurrenceStart),
    exdates: master.exdates?.filter((exdate) => Date.parse(exdate) < occurrenceStart),
    version: master.version + 1,
  };
  const movedExceptions = exceptions
    .filter((exception) => Date.parse(exception.start) >= occurrenceStart)
    .map((exception) => ({ ...exception, seriesId: newMaster.id, version: exception.version + 1 }));

  return { upsert: [oldMaster, newMaster, ...movedExceptions], remove: [], result: newMaster };
}

export function planSeriesDelete(state: SeriesState, scope: SeriesScope): SeriesPlan {
  const { master, exceptions, occurrenceStart } = state;

  if (scope === "this") {
    const updatedMaster: CalendarEvent = {
      ...master,
      exdates: [...(master.exdates ?? []), iso(occurrenceStart, master.timezone)],
      version: master.version + 1,
    };
    return { upsert: [updatedMaster], remove: [], result: null };
  }

  if (scope === "all" || isFirstOccurrence(state)) {
    return { upsert: [], remove: [master.id, ...exceptions.map((exception) => exception.id)], result: null };
  }

  const truncated: CalendarEvent = {
    ...master,
    rrule: rruleEndingBefore(master, occurrenceStart),
    exdates: master.exdates?.filter((exdate) => Date.parse(exdate) < occurrenceStart),
    version: master.version + 1,
  };
  const laterExceptions = exceptions.filter((exception) => Date.parse(exception.start) >= occurrenceStart);
  return { upsert: [truncated], remove: laterExceptions.map((exception) => exception.id), result: null };
}

/** Untrusted input (query param, action argument) -> scope, or undefined if absent. */
export function parseScope(value: unknown): SeriesScope | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string" && (SERIES_SCOPES as readonly string[]).includes(value)) return value as SeriesScope;
  throw new DomainError("VALIDATION_ERROR", "Some fields are invalid", { scope: ["Use this, following or all"] });
}
