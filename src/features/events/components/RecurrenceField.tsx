"use client";

import { Controller, useFormState, useWatch, get, type Control, type UseFormRegister } from "react-hook-form";
import { occurrencesOf } from "@/lib/recurrence/expand";
import {
  describeRecurrence,
  isLastWeekdayOfMonth,
  nthWeekdayOf,
  recurrenceToRRule,
} from "@/lib/recurrence/rule";
import { formatDateKey, formatInTimeZone, isValidDateKey, toZonedIso, weekdayOfDateKey } from "@/lib/time/zoned";
import { formValuesToInterval, type EventFormValues } from "../schema";

const WEEK = [
  { day: 1, label: "Mon" },
  { day: 2, label: "Tue" },
  { day: 3, label: "Wed" },
  { day: 4, label: "Thu" },
  { day: 5, label: "Fri" },
  { day: 6, label: "Sat" },
  { day: 0, label: "Sun" },
];
const ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th"];
const PREVIEW_COUNT = 5;
const TEN_YEARS_MS = 10 * 366 * 24 * 60 * 60 * 1000;

const inputClass =
  "rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm aria-[invalid=true]:border-red-500 dark:border-zinc-700 dark:bg-zinc-900";

type Props = {
  control: Control<EventFormValues>;
  register: UseFormRegister<EventFormValues>;
  /** Editing one occurrence: changing the rule then applies to following/all. */
  disabled?: boolean;
};

/**
 * Recurrence editor: the form keeps a structure (frequency, interval, days,
 * end), serialized to an RRULE only on save. Below it: a plain-language
 * summary and the next dates, computed with the same expansion as the server.
 */
export function RecurrenceField({ control, register, disabled }: Props) {
  const values = useWatch({
    control,
    name: ["recurrence", "startDate", "startTime", "endDate", "endTime", "timezone", "allDay"],
  });
  const [recurrence, startDate] = values;
  const { errors } = useFormState({ control, name: "recurrence" });
  const errorOf = (field: string): string | undefined => get(errors, `recurrence.${field}`)?.message;

  const unit = { daily: "day", weekly: "week", monthly: "month", yearly: "year" } as const;
  const repeats = recurrence.freq !== "none" && recurrence.freq !== "custom";
  const validStart = isValidDateKey(startDate);

  return (
    <fieldset disabled={disabled} className="flex flex-col gap-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <legend className="px-1 text-sm font-medium">Repeat</legend>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select aria-label="Repeat" {...register("recurrence.freq")} className={inputClass}>
          <option value="none">Does not repeat</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
          {recurrence.freq === "custom" && <option value="custom">Custom rule</option>}
        </select>

        {repeats && (
          <label className="flex items-center gap-2">
            every
            <input
              type="number"
              min={1}
              max={99}
              aria-label="Interval"
              aria-invalid={Boolean(errorOf("interval"))}
              {...register("recurrence.interval", { valueAsNumber: true })}
              className={`${inputClass} w-16`}
            />
            {unit[recurrence.freq as keyof typeof unit]}
            {recurrence.interval === 1 ? "" : "s"}
          </label>
        )}
      </div>
      <ErrorText message={errorOf("interval")} />

      {recurrence.freq === "weekly" && (
        <Controller
          control={control}
          name="recurrence.weekdays"
          render={({ field }) => (
            <div role="group" aria-label="Days of the week" className="flex flex-wrap gap-1">
              {WEEK.map(({ day, label }) => {
                // The start date's weekday is always part of a weekly series.
                const isStartDay = validStart && day === weekdayOfDateKey(startDate);
                const checked = isStartDay || field.value.includes(day);
                return (
                  <label
                    key={day}
                    title={isStartDay ? "The day the series starts is always included" : undefined}
                    className="flex cursor-pointer items-center rounded-md border border-zinc-300 px-2 py-1 text-xs has-checked:border-blue-600 has-checked:bg-blue-600 has-checked:text-white has-disabled:cursor-default has-disabled:opacity-80 has-focus-visible:ring-2 has-focus-visible:ring-blue-500 has-focus-visible:ring-offset-1 dark:border-zinc-700"
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      disabled={isStartDay}
                      onChange={() =>
                        field.onChange(checked ? field.value.filter((value) => value !== day) : [...field.value, day])
                      }
                    />
                    {label}
                  </label>
                );
              })}
            </div>
          )}
        />
      )}
      <ErrorText message={errorOf("weekdays")} />

      {recurrence.freq === "monthly" && validStart && (
        <select aria-label="Monthly on" {...register("recurrence.monthlyMode")} className={`${inputClass} self-start`}>
          <option value="dayOfMonth">On day {Number(startDate.slice(8))}</option>
          <option value="nthWeekday">
            On the {ORDINALS[nthWeekdayOf(startDate)]} {formatDateKey(startDate, "EEEE")}
          </option>
          {isLastWeekdayOfMonth(startDate) && (
            <option value="lastWeekday">On the last {formatDateKey(startDate, "EEEE")}</option>
          )}
        </select>
      )}

      {repeats && (
        <div role="radiogroup" aria-label="Ends" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="text-zinc-500">Ends</span>
          <label className="flex items-center gap-1.5">
            <input type="radio" value="never" {...register("recurrence.end")} /> Never
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" value="count" {...register("recurrence.end")} /> After
            <input
              type="number"
              min={1}
              aria-label="Number of occurrences"
              aria-invalid={Boolean(errorOf("count"))}
              disabled={recurrence.end !== "count"}
              {...register("recurrence.count", { valueAsNumber: true })}
              className={`${inputClass} w-16`}
            />
            times
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" value="until" {...register("recurrence.end")} /> On
            <input
              type="date"
              aria-label="Last day"
              aria-invalid={Boolean(errorOf("until"))}
              disabled={recurrence.end !== "until"}
              {...register("recurrence.until")}
              className={inputClass}
            />
          </label>
        </div>
      )}
      <ErrorText message={errorOf("count") ?? errorOf("until")} />

      {recurrence.freq === "custom" && (
        <p className="text-xs text-zinc-500">
          This rule was created elsewhere: <code>{recurrence.custom}</code>. Choose another option to replace it.
        </p>
      )}
      <ErrorText message={errorOf("custom") ?? errorOf("freq")} />

      {validStart && recurrence.freq !== "none" && <Preview values={values} />}
    </fieldset>
  );
}

/** Summary and next dates; nothing while the form values can't be resolved yet. */
function Preview({ values }: { values: [EventFormValues["recurrence"], string, string, string, string, string, boolean] }) {
  const [recurrence, startDate, startTime, endDate, endTime, timezone, allDay] = values;
  let dates: string[] = [];
  try {
    const rrule = recurrenceToRRule(recurrence, startDate);
    const { start, end } = formValuesToInterval({ allDay, startDate, startTime, endDate, endTime, timezone });
    dates = occurrencesOf(
      { start: toZonedIso(start, timezone), end: toZonedIso(end, timezone), timezone, rrule },
      { start, end: start + TEN_YEARS_MS },
      PREVIEW_COUNT,
    ).map((occurrence) =>
      formatInTimeZone(occurrence.start, timezone, allDay ? "EEE, MMM d, yyyy" : "EEE, MMM d, yyyy · HH:mm"),
    );
  } catch {
    // Incomplete input (e.g. an empty interval): the summary is enough for now.
  }

  return (
    <div aria-live="polite" className="rounded-md bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-800/60">
      <p className="font-medium">{describeRecurrence(recurrence, startDate)}</p>
      {dates.length > 0 && (
        <>
          <p className="mt-1 text-xs text-zinc-500">Next dates:</p>
          <ol className="text-xs">
            {dates.map((date) => (
              <li key={date}>{date}</li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

function ErrorText({ message }: { message?: string }) {
  return message ? <span className="text-xs text-red-700 dark:text-red-400">{message}</span> : null;
}
