import { z } from "zod";

const base = {
  id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "Use letters, digits, '-' or '_'"),
  label: z.string().trim().min(1, "Label is required").max(200),
  required: z.boolean(),
};

/** The spec's Question union (conditional `showIf` comes with the questionnaire builder). */
export const questionSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("text"), maxLength: z.number().int().min(1).max(5000) }),
  z.object({ ...base, kind: z.literal("email") }),
  z.object({
    ...base,
    kind: z.literal("select"),
    options: z.array(z.string().trim().min(1, "Option can't be empty").max(200)).min(1, "Add at least one option"),
    multiple: z.boolean(),
  }),
  z.object({ ...base, kind: z.literal("number"), min: z.number().optional(), max: z.number().optional() }),
  z.object({ ...base, kind: z.literal("checkbox") }),
  z.object({ ...base, kind: z.literal("phone"), defaultCountry: z.string().regex(/^[A-Z]{2}$/, "Use a 2-letter country code") }),
]);

/**
 * Body of PUT /api/booking-pages/:slug: the editable settings. `slug` and
 * `ownerId` come from the URL and the stored page and can't be changed here.
 */
export const bookingPageSettingsSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(100),
    durationOptions: z
      .array(z.number().int().min(5, "At least 5 minutes").max(480, "At most 8 hours"))
      .min(1, "Add at least one duration"),
    bufferBefore: z.number().int().min(0).max(240),
    bufferAfter: z.number().int().min(0).max(240),
    minNotice: z.number().int().min(0).max(60 * 24 * 30),
    horizonDays: z.number().int().min(1).max(365),
    questions: z.array(questionSchema).max(50),
  })
  .superRefine((settings, ctx) => {
    if (new Set(settings.durationOptions).size !== settings.durationOptions.length) {
      ctx.addIssue({ code: "custom", path: ["durationOptions"], message: "Durations must be unique" });
    }
    const ids = new Set<string>();
    settings.questions.forEach((question, index) => {
      if (ids.has(question.id)) {
        ctx.addIssue({ code: "custom", path: ["questions", index, "id"], message: "Question ids must be unique" });
      }
      ids.add(question.id);
      if (question.kind === "select" && new Set(question.options).size !== question.options.length) {
        ctx.addIssue({ code: "custom", path: ["questions", index, "options"], message: "Options must be unique" });
      }
      if (question.kind === "number" && question.min !== undefined && question.max !== undefined && question.min > question.max) {
        ctx.addIssue({ code: "custom", path: ["questions", index, "max"], message: "Max must not be below min" });
      }
    });
  });

export type BookingPageSettings = z.infer<typeof bookingPageSettingsSchema>;

/** Cache tag of a booking page; PUT revalidates it so the static page is rebuilt. */
export const bookingPageTag = (slug: string) => `booking-page:${slug}`;
