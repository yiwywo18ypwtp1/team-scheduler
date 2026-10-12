import { z } from "zod";
import type { AnswerValue, Question } from "@/types/domain";

export type Answers = Record<string, AnswerValue | undefined>;

/**
 * Whether a question is shown for the current answers. A question whose
 * condition refers to a hidden question is hidden too, so chains work.
 */
export function isQuestionVisible(question: Question, questions: readonly Question[], answers: Answers): boolean {
  const visited = new Set<string>();
  let current: Question | undefined = question;
  while (current?.showIf) {
    if (visited.has(current.id)) return false; // defensive: cycles can't be saved, but never loop
    visited.add(current.id);
    const condition: { questionId: string; equals: string | boolean } = current.showIf;
    const answer = answers[condition.questionId];
    const matches = Array.isArray(answer) ? answer.includes(String(condition.equals)) : answer === condition.equals;
    if (!matches) return false;
    current = questions.find((candidate) => candidate.id === condition.questionId);
    // A condition on a question that no longer exists can't be met.
    if (!current) return false;
  }
  return true;
}

const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{5,19}$/;
const REQUIRED = "This question is required";

/** zod schema for one visible question's answer. */
function answerSchema(question: Question): z.ZodType<AnswerValue | undefined> {
  switch (question.kind) {
    case "text": {
      const text = z.string().max(question.maxLength, `At most ${question.maxLength} characters`);
      return question.required ? text.trim().min(1, REQUIRED) : text.optional();
    }
    case "email":
      return question.required
        ? z.email("Enter a valid email")
        : z.union([z.literal(""), z.email("Enter a valid email")]).optional();
    case "phone":
      return question.required
        ? z.string().regex(PHONE_PATTERN, "Enter a valid phone number")
        : z.union([z.literal(""), z.string().regex(PHONE_PATTERN, "Enter a valid phone number")]).optional();
    case "select": {
      const option = z.string().refine((value) => question.options.includes(value), "Choose one of the options");
      if (question.multiple) {
        const list = z.array(option);
        return question.required ? list.min(1, "Choose at least one option") : list.optional();
      }
      return question.required ? option : z.union([z.literal(""), option]).optional();
    }
    case "number": {
      // An empty number input gives NaN; treat it as "no answer".
      let number = z.number({ message: "Enter a number" });
      if (question.min !== undefined) number = number.min(question.min, `At least ${question.min}`);
      if (question.max !== undefined) number = number.max(question.max, `At most ${question.max}`);
      const empty = z.preprocess((value) => (Number.isNaN(value) ? undefined : value), z.undefined());
      return question.required
        ? z.preprocess((value) => (Number.isNaN(value) ? undefined : value), number)
        : z.union([number, empty]);
    }
    case "checkbox":
      return question.required ? z.literal(true, { message: "Please confirm" }) : z.boolean().optional();
  }
}

/**
 * Builds the answers schema at runtime from the page's questions. Hidden
 * questions are neither validated nor kept: the output contains only visible
 * answers, so values of hidden questions never reach the server's storage.
 * Used by the public form (zodResolver) and again by the server with the
 * current questions.
 */
export function buildAnswersSchema(questions: readonly Question[]) {
  return z
    .record(z.string(), z.unknown())
    .transform((answers, ctx) => {
      const result: Record<string, AnswerValue> = {};
      for (const question of questions) {
        if (!isQuestionVisible(question, questions, answers as Answers)) continue;
        const parsed = answerSchema(question).safeParse(answers[question.id]);
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            ctx.addIssue({ code: "custom", path: [question.id, ...issue.path], message: issue.message });
          }
          continue;
        }
        const value = parsed.data;
        if (value !== undefined && value !== "" && !(Array.isArray(value) && value.length === 0)) {
          result[question.id] = value;
        }
      }
      return result;
    });
}

/** Empty answers matching each input's value type, for the form's defaultValues. */
export function emptyAnswers(questions: readonly Question[]): Answers {
  return Object.fromEntries(
    questions.map((question) => [
      question.id,
      question.kind === "checkbox"
        ? false
        : question.kind === "select" && question.multiple
          ? []
          : question.kind === "number"
            ? undefined
            : "",
    ]),
  );
}

/**
 * Short fingerprint of the questions. The public page sends the one it was
 * rendered with; if the owner changed the questions meanwhile, the server
 * notices and returns the new ones instead of validating against stale rules.
 */
export function questionsVersion(questions: readonly Question[]): string {
  // FNV-1a over the JSON: tiny, deterministic, the same in browser and Node.
  let hash = 0x811c9dc5;
  for (const char of JSON.stringify(questions)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Human-readable answer for summaries, emails and .ics files. */
export function formatAnswer(value: AnswerValue): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/** The guest's name and email, taken from the first text and email answers. */
export function guestIdentity(questions: readonly Question[], answers: Record<string, AnswerValue>) {
  const first = (kind: Question["kind"]) => {
    const question = questions.find((candidate) => candidate.kind === kind && typeof answers[candidate.id] === "string");
    return question ? (answers[question.id] as string) : undefined;
  };
  return { name: first("text") ?? "Guest", email: first("email") };
}
