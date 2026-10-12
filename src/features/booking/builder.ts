import type { Control } from "react-hook-form";
import { z } from "zod";
import type { BookingPage, Question } from "@/types/domain";
import { bookingPageSettingsSchema, type BookingPageSettings } from "./page-schema";

/**
 * The questionnaire builder's form values. Same as the page settings, except
 * that select options are `{ value }` objects: React Hook Form's field arrays
 * need objects (each gets a stable `id` key), not plain strings.
 */
export type BuilderQuestion =
  | Exclude<Question, { kind: "select" }>
  | (Omit<Extract<Question, { kind: "select" }>, "options"> & { options: { value: string }[] });

export type BuilderValues = Omit<BookingPageSettings, "questions"> & { questions: BuilderQuestion[] };

/** The builder form's control: edits BuilderValues, submits BookingPageSettings. */
export type BuilderControl = Control<BuilderValues, unknown, BookingPageSettings>;

export const QUESTION_KINDS: { kind: Question["kind"]; label: string }[] = [
  { kind: "text", label: "Text" },
  { kind: "email", label: "Email" },
  { kind: "phone", label: "Phone" },
  { kind: "select", label: "Choice" },
  { kind: "number", label: "Number" },
  { kind: "checkbox", label: "Checkbox" },
];

export const DURATION_PRESETS = [15, 20, 30, 45, 60, 90, 120];

export function settingsToBuilder(page: BookingPage): BuilderValues {
  return {
    title: page.title,
    durationOptions: page.durationOptions,
    bufferBefore: page.bufferBefore,
    bufferAfter: page.bufferAfter,
    minNotice: page.minNotice,
    horizonDays: page.horizonDays,
    questions: page.questions.map((question) =>
      question.kind === "select" ? { ...question, options: question.options.map((value) => ({ value })) } : question,
    ),
  };
}

/**
 * Changing a question's type replaces its kind-specific fields with fresh
 * defaults (no stale `options` on a text question), keeping id, label,
 * required and the condition.
 */
export function withKind(question: BuilderQuestion, kind: Question["kind"]): BuilderQuestion {
  const common = { id: question.id, label: question.label, required: question.required, showIf: question.showIf };
  switch (kind) {
    case "text":
      return { ...common, kind, maxLength: 200 };
    case "email":
    case "checkbox":
      return { ...common, kind };
    case "phone":
      return { ...common, kind, defaultCountry: "UA" };
    case "number":
      return { ...common, kind };
    case "select":
      return { ...common, kind, options: [{ value: "Option 1" }, { value: "Option 2" }], multiple: false };
  }
}

export function newQuestion(id: string): BuilderQuestion {
  return { id, kind: "text", label: "New question", required: false, maxLength: 200 };
}

/** Builder values -> page settings (the API/storage shape). */
export function builderToSettings(values: BuilderValues): BookingPageSettings {
  return {
    ...values,
    questions: values.questions.map((question): Question => {
      // An empty "show if" picker means no condition.
      const showIf = question.showIf?.questionId ? question.showIf : undefined;
      if (question.kind === "select") {
        return { ...question, showIf, options: question.options.map((option) => option.value) };
      }
      if (question.kind === "number") {
        // An emptied number input gives NaN: no limit.
        const limit = (value: number | undefined) => (value === undefined || Number.isNaN(value) ? undefined : value);
        return { ...question, showIf, min: limit(question.min), max: limit(question.max) };
      }
      return { ...question, showIf };
    }),
  };
}

/**
 * The builder's resolver schema: converts to settings and validates them with
 * the same schema as PUT /api/booking-pages/:slug, so the rules live in one place.
 * Error paths match the form, e.g. "questions.2.showIf.questionId".
 */
export const builderSchema = z
  .custom<BuilderValues>((value) => typeof value === "object" && value !== null)
  .transform(builderToSettings)
  .pipe(bookingPageSettingsSchema);
