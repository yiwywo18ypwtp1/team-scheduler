import { describe, expect, it } from "vitest";
import type { Question } from "@/types/domain";
import { buildAnswersSchema, emptyAnswers, formatAnswer, isQuestionVisible, questionsVersion } from "./answers";

const questions: Question[] = [
  { id: "name", kind: "text", label: "Name", required: true, maxLength: 20 },
  { id: "email", kind: "email", label: "Email", required: false },
  { id: "topic", kind: "select", label: "Topic", required: true, options: ["Sales", "Other"], multiple: false },
  { id: "details", kind: "text", label: "Details", required: true, maxLength: 200, showIf: { questionId: "topic", equals: "Other" } },
  { id: "urgent", kind: "checkbox", label: "Urgent?", required: false, showIf: { questionId: "details", equals: "now" } },
  { id: "size", kind: "number", label: "Team size", required: false, min: 1, max: 100 },
  { id: "agree", kind: "checkbox", label: "I agree", required: true },
  { id: "tags", kind: "select", label: "Tags", required: false, options: ["a", "b"], multiple: true },
  { id: "phone", kind: "phone", label: "Phone", required: false, defaultCountry: "UA" },
];

const schema = buildAnswersSchema(questions);
const base = { ...emptyAnswers(questions), name: "Olena", topic: "Sales", agree: true };

function errorsOf(answers: unknown) {
  const result = schema.safeParse(answers);
  return result.success ? {} : Object.fromEntries(result.error.issues.map((issue) => [issue.path.join("."), issue.message]));
}

describe("buildAnswersSchema", () => {
  it("accepts valid answers and keeps only non-empty visible ones", () => {
    expect(schema.parse(base)).toEqual({ name: "Olena", topic: "Sales", agree: true });
  });

  it("doesn't validate or submit a hidden required question", () => {
    // `details` is required but hidden while topic != Other: submitting passes, its value is dropped.
    expect(errorsOf({ ...base, details: "" })).toEqual({});
    expect(schema.parse({ ...base, details: "left over" })).not.toHaveProperty("details");
  });

  it("validates a conditional question once it is shown", () => {
    expect(errorsOf({ ...base, topic: "Other", details: "  " })).toEqual({ details: "This question is required" });
    expect(schema.parse({ ...base, topic: "Other", details: "Integration" })).toMatchObject({ details: "Integration" });
  });

  it("follows chains: a question depending on a hidden one is hidden", () => {
    // urgent depends on details, which is hidden while topic = Sales.
    expect(schema.parse({ ...base, details: "now", urgent: true })).not.toHaveProperty("urgent");
    expect(schema.parse({ ...base, topic: "Other", details: "now", urgent: true })).toMatchObject({ urgent: true });
  });

  it("validates each kind", () => {
    expect(
      errorsOf({ ...base, name: "x".repeat(21), email: "nope", topic: "Unknown", size: 500, agree: false, tags: ["c"], phone: "12" }),
    ).toEqual({
      name: "At most 20 characters",
      email: "Enter a valid email",
      topic: "Choose one of the options",
      size: "At most 100",
      agree: "Please confirm",
      "tags.0": "Choose one of the options",
      phone: "Enter a valid phone number",
    });
  });

  it("treats an empty number input (NaN) as no answer", () => {
    expect(schema.parse({ ...base, size: Number.NaN })).not.toHaveProperty("size");
  });

  it("ignores answers to unknown questions", () => {
    expect(schema.parse({ ...base, injected: "x" })).not.toHaveProperty("injected");
  });
});

describe("isQuestionVisible", () => {
  it("matches select, multi-select and checkbox conditions", () => {
    const multi: Question[] = [
      { id: "tags", kind: "select", label: "Tags", required: false, options: ["a", "b"], multiple: true },
      { id: "q", kind: "text", label: "Q", required: true, maxLength: 10, showIf: { questionId: "tags", equals: "b" } },
    ];
    expect(isQuestionVisible(multi[1]!, multi, { tags: ["a", "b"] })).toBe(true);
    expect(isQuestionVisible(multi[1]!, multi, { tags: ["a"] })).toBe(false);
    const check: Question[] = [
      { id: "c", kind: "checkbox", label: "C", required: false },
      { id: "q", kind: "text", label: "Q", required: true, maxLength: 10, showIf: { questionId: "c", equals: true } },
    ];
    expect(isQuestionVisible(check[1]!, check, { c: true })).toBe(true);
    expect(isQuestionVisible(check[1]!, check, { c: false })).toBe(false);
  });
});

describe("isQuestionVisible with a stale condition", () => {
  it("hides a question whose condition refers to a deleted question, even with an old answer", () => {
    const orphan: Question = { id: "q", kind: "text", label: "Q", required: true, maxLength: 10, showIf: { questionId: "gone", equals: "x" } };
    expect(isQuestionVisible(orphan, [orphan], { gone: "x" })).toBe(false);
  });
});

describe("questionsVersion / formatAnswer", () => {
  it("changes when the questions change", () => {
    expect(questionsVersion(questions)).toBe(questionsVersion([...questions]));
    expect(questionsVersion(questions)).not.toBe(questionsVersion(questions.slice(1)));
  });

  it("formats answers for people", () => {
    expect(formatAnswer(["a", "b"])).toBe("a, b");
    expect(formatAnswer(true)).toBe("Yes");
    expect(formatAnswer(12)).toBe("12");
  });
});
