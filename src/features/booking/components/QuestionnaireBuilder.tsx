"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import {
  Controller,
  useFieldArray,
  useForm,
  useFormState,
  useWatch,
  type FieldPath,
  type UseFormRegister,
} from "react-hook-form";
import { toast } from "sonner";
import type { Question } from "@/types/domain";
import { saveBookingPageAction } from "../actions";
import {
  builderSchema,
  builderToSettings,
  DURATION_PRESETS,
  newQuestion,
  type BuilderControl,
  type BuilderValues,
} from "../builder";
import type { BookingPageSettings } from "../page-schema";
import { QuestionEditor } from "./QuestionEditor";
import { QuestionFields } from "./QuestionFields";

// The schema is static, so one resolver for the module is enough.
const resolver = zodResolver(builderSchema);

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm aria-[invalid=true]:border-red-500 dark:border-zinc-700 dark:bg-zinc-900";

type Props = { slug: string; defaultValues: BuilderValues };

/**
 * Booking page settings + questionnaire builder, with a live preview of the
 * public form. The list is a useFieldArray over the Question union.
 *
 * This component reads no form state, so it re-renders only on structural
 * changes (add, remove, move), never while typing. The settings fields, the
 * save bar, each card and the preview subscribe to just what they show.
 */
export function QuestionnaireBuilder({ slug, defaultValues }: Props) {
  const { control, register, handleSubmit, setValue, getValues, setError, reset } = useForm<
    BuilderValues,
    unknown,
    BookingPageSettings
  >({ resolver, defaultValues });
  // keyName: questions have their own `id` field, which must not be overwritten.
  const { fields, append, remove, move } = useFieldArray({ control, name: "questions", keyName: "key" });
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (settings) => {
    setFormError(null);
    const result = await saveBookingPageAction(slug, settings);
    if (!result.ok) {
      for (const [path, messages] of Object.entries(result.error.fieldErrors ?? {})) {
        setError(path as FieldPath<BuilderValues>, { type: "server", message: messages[0] });
      }
      if (!result.error.fieldErrors) setFormError(result.error.message);
      return;
    }
    toast.success("Saved. The public page is updated.");
    reset(getValues()); // the saved values become the new clean state
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <div className="flex flex-col gap-6">
        <SettingsFields control={control} register={register} />

        <section aria-labelledby="questions-title" className="flex flex-col gap-3">
          <h2 id="questions-title" className="text-sm font-medium">
            Questions
          </h2>
          <ol className="flex flex-col gap-3">
            {fields.map((field, index) => (
              <QuestionEditor
                key={field.key}
                index={index}
                count={fields.length}
                control={control}
                register={register}
                setValue={setValue}
                getValues={getValues}
                onRemove={() => remove(index)}
                onMove={(to) => move(index, to)}
                dragHandle={{
                  draggable: true,
                  onDragStart: (event) => {
                    event.dataTransfer.effectAllowed = "move";
                    setDragFrom(index);
                  },
                  onDragEnd: () => setDragFrom(null),
                }}
                dropTarget={{
                  onDragOver: (event) => {
                    if (dragFrom !== null) event.preventDefault();
                  },
                  onDrop: (event) => {
                    event.preventDefault();
                    if (dragFrom !== null && dragFrom !== index) move(dragFrom, index);
                    setDragFrom(null);
                  },
                }}
              />
            ))}
          </ol>
          <button
            type="button"
            onClick={() => append(newQuestion(`q_${crypto.randomUUID().slice(0, 8)}`))}
            className="self-start rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            Add question
          </button>
        </section>

        {formError && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
            {formError}
          </p>
        )}
        <SaveBar control={control} />
      </div>

      <BuilderPreview control={control} />
    </form>
  );
}

/** Page-level settings; subscribes to its own errors only. */
function SettingsFields({ control, register }: { control: BuilderControl; register: UseFormRegister<BuilderValues> }) {
  const { errors } = useFormState({ control });
  return (
    <fieldset className="grid gap-3 rounded-lg border border-zinc-200 p-4 sm:grid-cols-2 dark:border-zinc-800">
      <legend className="px-1 text-sm font-medium">Page settings</legend>
      <label className="flex flex-col gap-1 text-xs sm:col-span-2">
        Title
        <input {...register("title")} aria-invalid={Boolean(errors.title)} className={inputClass} />
        <ErrorText message={errors.title?.message} />
      </label>
      <Controller
        control={control}
        name="durationOptions"
        render={({ field, fieldState }) => (
          <fieldset className="flex flex-col gap-1 text-xs sm:col-span-2">
            <legend>Durations (minutes)</legend>
            <div className="flex flex-wrap gap-1">
              {DURATION_PRESETS.map((minutes) => (
                <label key={minutes} className="flex items-center gap-1 rounded border border-zinc-300 px-2 py-0.5 dark:border-zinc-700">
                  <input
                    type="checkbox"
                    checked={field.value.includes(minutes)}
                    onChange={() =>
                      field.onChange(
                        field.value.includes(minutes)
                          ? field.value.filter((value) => value !== minutes)
                          : [...field.value, minutes].sort((a, b) => a - b),
                      )
                    }
                  />
                  {minutes}
                </label>
              ))}
            </div>
            <ErrorText message={fieldState.error?.message ?? fieldState.error?.root?.message} />
          </fieldset>
        )}
      />
      {(
        [
          ["bufferBefore", "Buffer before (min)"],
          ["bufferAfter", "Buffer after (min)"],
          ["minNotice", "Minimum notice (min)"],
          ["horizonDays", "Bookable ahead (days)"],
        ] as const
      ).map(([name, label]) => (
        <label key={name} className="flex flex-col gap-1 text-xs">
          {label}
          <input
            type="number"
            min={0}
            {...register(name, { valueAsNumber: true })}
            aria-invalid={Boolean(errors[name])}
            className={inputClass}
          />
          <ErrorText message={errors[name]?.message} />
        </label>
      ))}
    </fieldset>
  );
}

/** Save button and dirty hint; the only part that re-renders when the form becomes dirty. */
function SaveBar({ control }: { control: BuilderControl }) {
  const { isDirty, isSubmitting } = useFormState({ control });
  return (
    <div className="flex items-center gap-3">
      <button
        type="submit"
        disabled={isSubmitting || !isDirty}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {isSubmitting ? "Saving…" : "Save"}
      </button>
      {isDirty && <span className="text-xs text-zinc-500">Unsaved changes</span>}
    </div>
  );
}

/**
 * The public form, built from the builder's current values. Its own small
 * form holds the preview answers, so conditional questions can be tried out.
 */
function BuilderPreview({ control }: { control: BuilderControl }) {
  const values = useWatch({ control }) as BuilderValues;
  const preview = useForm<{ answers: Record<string, unknown> }>({ defaultValues: { answers: {} } });

  let questions: Question[] = [];
  try {
    questions = builderToSettings({ ...values, questions: values.questions ?? [] }).questions;
  } catch {
    // Half-edited values: keep the last renderable preview simple.
  }

  return (
    <aside aria-label="Preview" className="lg:sticky lg:top-4 lg:self-start">
      <div className="flex flex-col gap-3 rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Preview</p>
        <h2 className="text-lg font-semibold">{values.title || "Untitled"}</h2>
        <QuestionFields questions={questions} control={preview.control} name="answers" />
        {questions.length === 0 && <p className="text-sm text-zinc-500">No questions yet.</p>}
      </div>
    </aside>
  );
}

function ErrorText({ message }: { message?: string }) {
  return message ? <span className="text-xs text-red-700 dark:text-red-400">{message}</span> : null;
}
