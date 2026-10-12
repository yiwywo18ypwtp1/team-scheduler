import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DomainError, toApiError, validationError } from "./errors";

describe("validationError", () => {
  it("keys messages by dotted path", () => {
    const schema = z.object({
      title: z.string().min(1, "Required"),
      location: z.object({ url: z.url("Bad URL") }),
    });
    const result = schema.safeParse({ title: "", location: { url: "nope" } });
    expect(result.success).toBe(false);
    if (result.success) return;

    expect(validationError(result.error).fieldErrors).toEqual({
      title: ["Required"],
      "location.url": ["Bad URL"],
    });
  });
});

describe("toApiError", () => {
  it("maps domain errors to their status", () => {
    expect(toApiError(new DomainError("VERSION_CONFLICT", "Changed"))).toEqual({
      status: 409,
      error: { code: "VERSION_CONFLICT", message: "Changed", fieldErrors: undefined, details: undefined },
    });
  });

  it("hides unexpected errors behind a generic message", () => {
    const original = console.error;
    console.error = () => {};
    try {
      expect(toApiError(new Error("SQL details"))).toEqual({
        status: 500,
        error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
      });
    } finally {
      console.error = original;
    }
  });
});
