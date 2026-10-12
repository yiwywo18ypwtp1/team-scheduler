"use client";

import {
  get,
  useFieldArray,
  useFormState,
  useWatch,
  type UseFormGetValues,
  type UseFormRegister,
  type UseFormSetValue,
} from "react-hook-form";
import { QUESTION_KINDS, withKind, type BuilderControl, type BuilderQuestion, type BuilderValues } from "../builder";

// No width here: each input sets its own (full width or a fixed size).
const inputClass =
  "rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm aria-[invalid=true]:border-red-500 dark:border-zinc-700 dark:bg-zinc-900";

type Props = {
  index: number;
  count: number;
  control: BuilderControl;
  register: UseFormRegister<BuilderValues>;
  setValue: UseFormSetValue<BuilderValues>;
  getValues: UseFormGetValues<BuilderValues>;
  onRemove: () => void;
  onMove: (to: number) => void;
  /** Native drag-n-drop: the handle starts a drag, the card accepts a drop. */
  dragHandle: React.HTMLAttributes<HTMLElement> & { draggable: boolean };
  dropTarget: React.HTMLAttributes<HTMLElement>;
};

/**
 * One question card. Inputs are registered (uncontrolled), so typing doesn't
 * re-render anything; the card re-renders only when its own kind or errors
 * change (useWatch / useFormState scoped to this question).
 */
export function QuestionEditor({
  index,
  count,
  control,
  register,
  setValue,
  getValues,
  onRemove,
  onMove,
  dragHandle,
  dropTarget,
}: Props) {
  const name = `questions.${index}` as const;
  const kind = useWatch({ control, name: `${name}.kind` }) as BuilderQuestion["kind"];
  const { errors } = useFormState({ control, name });
  const errorAt = (path: string): string | undefined => get(errors, `${name}.${path}`)?.message;

  return (
    <li
      {...dropTarget}
      aria-label={`Question ${index + 1}`}
      className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex items-center gap-2">
        <span {...dragHandle} aria-hidden title="Drag to reorder" className="cursor-grab select-none text-zinc-400">
          ⠿
        </span>
        <span className="text-xs text-zinc-500">#{index + 1}</span>
        <select
          aria-label="Question type"
          value={kind}
          // Changing the type replaces the kind-specific fields with fresh defaults.
          onChange={(event) =>
            setValue(name, withKind(getValues(name), event.target.value as BuilderQuestion["kind"]), {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
          className={`${inputClass} w-32`}
        >
          {QUESTION_KINDS.map(({ kind, label }) => (
            <option key={kind} value={kind}>
              {label}
            </option>
          ))}
        </select>
        <label className="ml-auto flex items-center gap-1.5 text-xs">
          <input type="checkbox" {...register(`${name}.required`)} /> Required
        </label>
        <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => onMove(index - 1)} className="rounded px-1.5 disabled:opacity-30">
          ↑
        </button>
        <button type="button" aria-label="Move down" disabled={index === count - 1} onClick={() => onMove(index + 1)} className="rounded px-1.5 disabled:opacity-30">
          ↓
        </button>
        <button type="button" aria-label="Delete question" onClick={onRemove} className="rounded px-1.5 text-red-700 dark:text-red-400">
          ✕
        </button>
      </div>

      <label className="flex flex-col gap-1 text-xs">
        Label
        <input {...register(`${name}.label`)} aria-invalid={Boolean(errorAt("label"))} className={`${inputClass} w-full`} />
        <ErrorText message={errorAt("label")} />
      </label>

      {kind === "text" && (
        <label className="flex items-center gap-2 text-xs">
          Max length
          <input type="number" min={1} {...register(`${name}.maxLength`, { valueAsNumber: true })} className={`${inputClass} w-24`} />
          <ErrorText message={errorAt("maxLength")} />
        </label>
      )}
      {kind === "number" && (
        <div className="flex items-center gap-2 text-xs">
          Min <input type="number" {...register(`${name}.min`, { valueAsNumber: true })} className={`${inputClass} w-20`} />
          Max <input type="number" {...register(`${name}.max`, { valueAsNumber: true })} className={`${inputClass} w-20`} />
          <ErrorText message={errorAt("max")} />
        </div>
      )}
      {kind === "phone" && (
        <label className="flex items-center gap-2 text-xs">
          Default country
          <input {...register(`${name}.defaultCountry`)} maxLength={2} className={`${inputClass} w-16 uppercase`} />
          <ErrorText message={errorAt("defaultCountry")} />
        </label>
      )}
      {kind === "select" && (
        <OptionsEditor index={index} control={control} register={register} errorAt={errorAt} />
      )}

      <ShowIfEditor index={index} control={control} register={register} setValue={setValue} errorAt={errorAt} />
      <ErrorText message={errorAt("id")} />
    </li>
  );
}

/** Nested field array: the options of a choice question. */
function OptionsEditor({
  index,
  control,
  register,
  errorAt,
}: {
  index: number;
  control: BuilderControl;
  register: UseFormRegister<BuilderValues>;
  errorAt: (path: string) => string | undefined;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: `questions.${index}.options` as never });
  return (
    <div className="flex flex-col gap-1 text-xs">
      <div className="flex items-center gap-3">
        Options
        <label className="flex items-center gap-1.5">
          <input type="checkbox" {...register(`questions.${index}.multiple` as never)} /> Several answers
        </label>
      </div>
      <ul className="flex flex-col gap-1">
        {fields.map((field, optionIndex) => (
          <li key={field.id} className="flex items-center gap-1">
            <input
              aria-label={`Option ${optionIndex + 1}`}
              {...register(`questions.${index}.options.${optionIndex}.value` as never)}
              aria-invalid={Boolean(errorAt(`options.${optionIndex}`))}
              className={`${inputClass} w-full`}
            />
            <button type="button" aria-label={`Remove option ${optionIndex + 1}`} onClick={() => remove(optionIndex)} className="px-1.5">
              ✕
            </button>
          </li>
        ))}
      </ul>
      {/* Array-level errors of a field array are stored under `root`. */}
      <ErrorText
        message={errorAt("options") ?? errorAt("options.root") ?? fields.map((_, i) => errorAt(`options.${i}`)).find(Boolean)}
      />
      <button
        type="button"
        onClick={() => append({ value: `Option ${fields.length + 1}` } as never)}
        className="self-start text-blue-700 underline dark:text-blue-400"
      >
        Add option
      </button>
    </div>
  );
}

type ShowIfProps = {
  index: number;
  control: BuilderControl;
  register: UseFormRegister<BuilderValues>;
  setValue: UseFormSetValue<BuilderValues>;
  errorAt: (path: string) => string | undefined;
};

/** "Show only if <earlier question> is <value>". */
function ShowIfEditor(props: ShowIfProps) {
  const { index, control, setValue } = props;
  const hasCondition = Boolean(useWatch({ control, name: `questions.${index}.showIf` }));

  if (!hasCondition) {
    // Conditions refer to earlier questions, so the first one has nothing to depend on.
    if (index === 0) return <span className="text-xs text-zinc-400">The first question is always shown</span>;
    return (
      <button
        type="button"
        onClick={() => setValue(`questions.${index}.showIf`, { questionId: "", equals: "" }, { shouldDirty: true })}
        className="self-start text-xs text-blue-700 underline dark:text-blue-400"
      >
        Show only if…
      </button>
    );
  }
  return <ShowIfFields {...props} />;
}

/** Only questions that have a condition watch the others (labels and options). */
function ShowIfFields({ index, control, register, setValue, errorAt }: ShowIfProps) {
  const questions = useWatch({ control, name: "questions" }) as BuilderQuestion[];
  const showIf = questions[index]?.showIf;
  const target = questions.find((question) => question.id === showIf?.questionId);
  const earlier = questions.slice(0, index);
  if (!showIf) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      Show only if
      <select
        aria-label="Depends on question"
        {...register(`questions.${index}.showIf.questionId`)}
        aria-invalid={Boolean(errorAt("showIf.questionId"))}
        className={`${inputClass} w-44`}
      >
        <option value="">Choose a question…</option>
        {/* A reference to a deleted or later question stays visible, and is flagged as an error. */}
        {target && !earlier.includes(target) && <option value={target.id}>{target.label} (not earlier)</option>}
        {showIf.questionId && !target && <option value={showIf.questionId}>Deleted question</option>}
        {earlier.map((question) => (
          <option key={question.id} value={question.id}>
            {question.label}
          </option>
        ))}
      </select>
      is
      {target?.kind === "checkbox" ? (
        <select
          aria-label="Expected answer"
          value={String(showIf.equals)}
          onChange={(event) => setValue(`questions.${index}.showIf.equals`, event.target.value === "true", { shouldDirty: true, shouldValidate: true })}
          className={`${inputClass} w-28`}
        >
          <option value="true">checked</option>
          <option value="false">unchecked</option>
        </select>
      ) : target?.kind === "select" ? (
        <select aria-label="Expected answer" {...register(`questions.${index}.showIf.equals`)} className={`${inputClass} w-40`}>
          <option value="">Choose…</option>
          {target.options.map((option, optionIndex) => (
            <option key={optionIndex} value={option.value}>
              {option.value}
            </option>
          ))}
        </select>
      ) : (
        <input aria-label="Expected answer" {...register(`questions.${index}.showIf.equals`)} className={`${inputClass} w-40`} />
      )}
      <button
        type="button"
        onClick={() => setValue(`questions.${index}.showIf`, undefined, { shouldDirty: true, shouldValidate: true })}
        className="text-blue-700 underline dark:text-blue-400"
      >
        Always show
      </button>
      <ErrorText message={errorAt("showIf.questionId") ?? errorAt("showIf.equals")} />
    </div>
  );
}

function ErrorText({ message }: { message?: string }) {
  return message ? <span className="text-xs text-red-700 dark:text-red-400">{message}</span> : null;
}
