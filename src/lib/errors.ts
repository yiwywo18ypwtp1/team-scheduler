import { z } from "zod";

/**
 * Error contract shared by Route Handlers (`{ error }` JSON body) and
 * Server Actions (`{ ok: false, error }` result). Lives outside `server/`
 * because client code reads the same shape.
 */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "SLOT_TAKEN"
  | "MOCK_FAILURE"
  | "INTERNAL_ERROR";

export type FieldErrors = Record<string, string[]>;

export type ApiError = {
  code: ErrorCode;
  message: string;
  fieldErrors?: FieldErrors;
};

export type ApiErrorBody = { error: ApiError };

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: ApiError };

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  SLOT_TAKEN: 409,
  MOCK_FAILURE: 503,
  INTERNAL_ERROR: 500,
};

/** Expected, user-facing failure. Domain code throws it; adapters turn it into ApiError. */
export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly fieldErrors?: FieldErrors;

  constructor(code: ErrorCode, message: string, fieldErrors?: FieldErrors) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }

  get status(): number {
    return STATUS_BY_CODE[this.code];
  }
}

export function validationError(error: z.ZodError): DomainError {
  return new DomainError(
    "VALIDATION_ERROR",
    "Some fields are invalid",
    z.flattenError(error).fieldErrors as FieldErrors,
  );
}

/**
 * Converts anything thrown into the public error shape. Unexpected errors are
 * logged and hidden behind a generic message so internals don't leak to clients.
 */
export function toApiError(error: unknown): { status: number; error: ApiError } {
  if (error instanceof DomainError) {
    return {
      status: error.status,
      error: { code: error.code, message: error.message, fieldErrors: error.fieldErrors },
    };
  }
  console.error(error);
  return {
    status: STATUS_BY_CODE.INTERNAL_ERROR,
    error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
  };
}
