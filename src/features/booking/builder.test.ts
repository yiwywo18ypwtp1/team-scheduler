import { describe, expect, it } from "vitest";
import type { BookingPage } from "@/types/domain";
import { builderSchema, builderToSettings, settingsToBuilder, withKind, type BuilderValues } from "./builder";

const page: BookingPage = {
  slug: "intro",
  ownerId: "mem_01",
  title: "Intro",
  durationOptions: [30],
  bufferBefore: 0,
  bufferAfter: 0,
  minNotice: 60,
  horizonDays: 14,
  questions: [
    { id: "topic", kind: "select", label: "Topic", required: true, options: ["A", "Other"], multiple: false },
    { id: "details", kind: "text", label: "Details", required: true, maxLength: 100, showIf: { questionId: "topic", equals: "Other" } },
  ],
};

function errorsOf(values: BuilderValues) {
  const result = builderSchema.safeParse(values);
  return result.success ? {} : Object.fromEntries(result.error.issues.map((issue) => [issue.path.join("."), issue.message]));
}

describe("builder conversions", () => {
  it("round-trips page settings through the builder shape", () => {
    const values = settingsToBuilder(page);
    expect(values.questions[0]).toMatchObject({ options: [{ value: "A" }, { value: "Other" }] });
    expect({ ...builderToSettings(values), slug: page.slug, ownerId: page.ownerId }).toEqual(page);
  });

  it("drops an empty condition and NaN number limits", () => {
    const values: BuilderValues = {
      ...settingsToBuilder(page),
      questions: [
        { id: "n", kind: "number", label: "N", required: false, min: Number.NaN, max: 5, showIf: { questionId: "", equals: "" } },
      ],
    };
    expect(builderToSettings(values).questions[0]).toEqual({ id: "n", kind: "number", label: "N", required: false, min: undefined, max: 5, showIf: undefined });
  });
});

describe("withKind", () => {
  it("resets kind-specific fields and keeps the common ones", () => {
    const select = settingsToBuilder(page).questions[0]!;
    const text = withKind(select, "text");
    expect(text).toEqual({ id: "topic", label: "Topic", required: true, showIf: undefined, kind: "text", maxLength: 200 });
    expect(text).not.toHaveProperty("options");
    expect(withKind(text, "select")).toMatchObject({ kind: "select", options: [{ value: "Option 1" }, { value: "Option 2" }] });
  });
});

describe("builderSchema", () => {
  it("accepts a valid page", () => {
    expect(errorsOf(settingsToBuilder(page))).toEqual({});
  });

  it("reports errors at the builder's own paths", () => {
    const values = settingsToBuilder(page);
    // Move the conditional question above the one it refers to, duplicate an option.
    const broken: BuilderValues = {
      ...values,
      questions: [values.questions[1]!, { ...values.questions[0]!, options: [{ value: "A" }, { value: "A" }] } as BuilderValues["questions"][number]],
    };
    expect(errorsOf(broken)).toEqual({
      "questions.0.showIf.questionId": "Must refer to an earlier question",
      "questions.1.options": "Options must be unique",
    });
  });
});
