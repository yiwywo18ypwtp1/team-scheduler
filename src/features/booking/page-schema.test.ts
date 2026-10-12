import { describe, expect, it } from "vitest";
import { bookingPageSettingsSchema, type BookingPageSettings } from "./page-schema";

const valid: BookingPageSettings = {
  title: "Intro call",
  durationOptions: [30, 60],
  bufferBefore: 10,
  bufferAfter: 10,
  minNotice: 1440,
  horizonDays: 30,
  questions: [
    { id: "q_name", kind: "text", label: "Name", required: true, maxLength: 100 },
    { id: "q_topic", kind: "select", label: "Topic", required: false, options: ["Sales", "Support"], multiple: false },
  ],
};

function errorsOf(input: unknown) {
  const result = bookingPageSettingsSchema.safeParse(input);
  return result.success ? {} : Object.fromEntries(result.error.issues.map((issue) => [issue.path.join("."), issue.message]));
}

describe("bookingPageSettingsSchema", () => {
  it("accepts valid settings", () => {
    expect(errorsOf(valid)).toEqual({});
  });

  it("rejects duplicate durations, duplicate question ids and duplicate options", () => {
    expect(
      errorsOf({
        ...valid,
        durationOptions: [30, 30],
        questions: [
          valid.questions[0],
          { ...valid.questions[0], label: "Again" },
          { id: "q_x", kind: "select", label: "X", required: true, options: ["A", "A"], multiple: true },
        ],
      }),
    ).toEqual({
      durationOptions: "Durations must be unique",
      "questions.1.id": "Question ids must be unique",
      "questions.2.options": "Options must be unique",
    });
  });

  it("validates each question kind by its own fields", () => {
    expect(errorsOf({ ...valid, questions: [{ id: "p", kind: "phone", label: "Phone", required: true, defaultCountry: "ukraine" }] })).toEqual({
      "questions.0.defaultCountry": "Use a 2-letter country code",
    });
    expect(errorsOf({ ...valid, questions: [{ id: "x", kind: "unknown", label: "?", required: true }] })).toHaveProperty(["questions.0.kind"]);
  });
});

describe("showIf", () => {
  const topic = { id: "topic", kind: "select" as const, label: "Topic", required: true, options: ["A", "Other"], multiple: false };
  const details = { id: "details", kind: "text" as const, label: "Details", required: true, maxLength: 100 };

  it("accepts a condition on an earlier question's option", () => {
    expect(errorsOf({ ...valid, questions: [topic, { ...details, showIf: { questionId: "topic", equals: "Other" } }] })).toEqual({});
  });

  it("rejects references to later or deleted questions, and impossible values", () => {
    expect(errorsOf({ ...valid, questions: [{ ...details, showIf: { questionId: "topic", equals: "Other" } }, topic] })).toEqual({
      "questions.0.showIf.questionId": "Must refer to an earlier question",
    });
    expect(errorsOf({ ...valid, questions: [topic, { ...details, showIf: { questionId: "gone", equals: "Other" } }] })).toEqual({
      "questions.1.showIf.questionId": "Must refer to an earlier question",
    });
    expect(errorsOf({ ...valid, questions: [topic, { ...details, showIf: { questionId: "topic", equals: "Nope" } }] })).toEqual({
      "questions.1.showIf.equals": "Pick one of that question's options",
    });
  });
});
