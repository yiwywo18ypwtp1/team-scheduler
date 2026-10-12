import { z } from "zod";
import type { CalendarEvent, Question } from "@/types/domain";

/**
 * Error contract shared by Route Handlers (`{ error }` JSON body) and
 * Server Actions (`{ ok: false, error }` result). Lives outside `server/`
 * because client code reads the same shape.
 */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "PRECONDITION_REQUIRED"
  | "IDEMPOTENCY_CONFLICT"
  | "QUESTIONS_CHANGED"
  | "SLOT_TAKEN"
  | "MOCK_FAILURE"
  | "INTERNAL_ERROR";

/** Keyed by dotted field path, e.g. "title" or "location.url". */
export type FieldErrors = Record<string, string[]>;

/**
 * Extra data for specific errors: free alternatives when a slot was taken;
 * the server's current event (and its series rule) on a version conflict,
 * so the client can show what changed and let the user choose.
 */
export type ErrorDetails = {
  alternatives?: { start: string; end: string }[];
  current?: CalendarEvent;
  currentRule?: string;
  /** The booking page's current questions when they changed under the guest. */
  questions?: Question[];
  questionsVersion?: string;
};

export type ApiError = {
  code: ErrorCode;
  message: string;
  fieldErrors?: FieldErrors;
  details?: ErrorDetails;
};

export type ApiErrorBody = { error: ApiError };

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: ApiError };

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  PRECONDITION_REQUIRED: 428,
  IDEMPOTENCY_CONFLICT: 422,
  QUESTIONS_CHANGED: 409,
  SLOT_TAKEN: 409,
  MOCK_FAILURE: 503,
  INTERNAL_ERROR: 500,
};

/** Expected, user-facing failure. Domain code throws it; adapters turn it into ApiError. */
export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly fieldErrors?: FieldErrors;
  readonly details?: ErrorDetails;

  constructor(code: ErrorCode, message: string, fieldErrors?: FieldErrors, details?: ErrorDetails) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.details = details;
  }

  get status(): number {
    return STATUS_BY_CODE[this.code];
  }
}

/**
 * Zod error -> DomainError with dotted paths. `z.flattenError` only keeps
 * top-level keys, but forms need nested ones like "location.url".
 */
export function validationError(error: z.ZodError): DomainError {
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "form";
    (fieldErrors[path] ??= []).push(issue.message);
  }
  return new DomainError("VALIDATION_ERROR", "Some fields are invalid", fieldErrors);
}

/**
 * Converts anything thrown into the public error shape. Unexpected errors are
 * logged and hidden behind a generic message so internals don't leak to clients.
 */
export function toApiError(error: unknown): { status: number; error: ApiError } {
  if (error instanceof DomainError) {
    return {
      status: error.status,
      error: {
        code: error.code,
        message: error.message,
        fieldErrors: error.fieldErrors,
        details: error.details,
      },
    };
  }
  console.error(error);
  return {
    status: STATUS_BY_CODE.INTERNAL_ERROR,
    error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
  };
}
