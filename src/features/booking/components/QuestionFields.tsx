"use client";

import { Controller, get, useFormState, useWatch, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import type { Question } from "@/types/domain";
import { isQuestionVisible, type Answers } from "../answers";

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm aria-[invalid=true]:border-red-500 dark:border-zinc-700 dark:bg-zinc-900";

type Props<T extends FieldValues> = {
  questions: readonly Question[];
  control: Control<T>;
  /** Where the answers live in the form values, e.g. "answers". */
  name: string;
  disabled?: boolean;
};

/**
 * Renders a booking page's questionnaire from data. Conditional questions
 * appear and disappear as answers change; hidden ones are not rendered, and
 * the runtime schema neither validates nor submits them.
 * Generic over the form type, so the live preview in the builder reuses it.
 */
export function QuestionFields<T extends FieldValues>({ questions, control, name, disabled }: Props<T>) {
  const answers = (useWatch({ control, name: name as FieldPath<T> }) ?? {}) as Answers;
  const { errors } = useFormState({ control });

  return (
    <>
      {questions.map((question) => {
        if (!isQuestionVisible(question, questions, answers)) return null;
        const path = `${name}.${question.id}` as FieldPath<T>;
        const error: string | undefined = get(errors, path)?.message;
        const id = `answer-${question.id}`;
        const errorId = `${id}-error`;
        const aria = { id, "aria-invalid": error ? true : undefined, "aria-describedby": error ? errorId : undefined };
        const label = (
          <span className="font-medium">
            {question.label}
            {question.required ? " *" : " (optional)"}
          </span>
        );

        return (
          <div key={question.id} className="flex flex-col gap-1 text-sm">
            <Controller
              control={control}
              name={path}
              disabled={disabled}
              render={({ field }) => {
                switch (question.kind) {
                  case "checkbox":
                    return (
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          {...aria}
                          checked={Boolean(field.value)}
                          onChange={(event) => field.onChange(event.target.checked)}
                          onBlur={field.onBlur}
                        />
                        {label}
                      </label>
                    );
                  case "select":
                    if (question.multiple) {
                      const selected: string[] = Array.isArray(field.value) ? field.value : [];
                      return (
                        <fieldset aria-describedby={aria["aria-describedby"]} className="flex flex-col gap-1">
                          <legend className="mb-1">{label}</legend>
                          {question.options.map((option) => (
                            <label key={option} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={selected.includes(option)}
                                onChange={() =>
                                  field.onChange(
                                    selected.includes(option)
                                      ? selected.filter((value) => value !== option)
                                      : [...selected, option],
                                  )
                                }
                              />
                              {option}
                            </label>
                          ))}
                        </fieldset>
                      );
                    }
                    return (
                      <label className="flex flex-col gap-1">
                        {label}
                        <select {...aria} {...field} value={field.value ?? ""} className={inputClass}>
                          <option value="">Choose…</option>
                          {question.options.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  case "number":
                    return (
                      <label className="flex flex-col gap-1">
                        {label}
                        <input
                          type="number"
                          {...aria}
                          min={question.min}
                          max={question.max}
                          value={Number.isFinite(field.value) ? field.value : ""}
                          onChange={(event) => field.onChange(event.target.valueAsNumber)}
                          onBlur={field.onBlur}
                          className={inputClass}
                        />
                      </label>
                    );
                  case "text":
                    return (
                      <label className="flex flex-col gap-1">
                        {label}
                        {question.maxLength > 200 ? (
                          <textarea rows={3} {...aria} {...field} value={field.value ?? ""} maxLength={question.maxLength} className={inputClass} />
                        ) : (
                          <input {...aria} {...field} value={field.value ?? ""} maxLength={question.maxLength} className={inputClass} />
                        )}
                      </label>
                    );
                  case "email":
                  case "phone":
                    return (
                      <label className="flex flex-col gap-1">
                        {label}
                        <input
                          type={question.kind === "email" ? "email" : "tel"}
                          autoComplete={question.kind === "email" ? "email" : "tel"}
                          placeholder={question.kind === "phone" ? `+… (${question.defaultCountry})` : undefined}
                          {...aria}
                          {...field}
                          value={field.value ?? ""}
                          className={inputClass}
                        />
                      </label>
                    );
                }
              }}
            />
            {error && (
              <span id={errorId} className="text-xs text-red-700 dark:text-red-400">
                {error}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}
