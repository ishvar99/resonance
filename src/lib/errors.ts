/**
 * Typed application errors.
 *
 * Everything thrown across a feature boundary should be an `ApplicationError`
 * so route handlers and server actions can map it to a safe status code and a
 * user-facing message. `message` is safe to show a user; `cause` and any
 * internal detail stay server-side and go to Sentry only.
 */

export type ApplicationErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "BILLING_REQUIRED"
  | "RATE_LIMITED"
  | "GENERATION_FAILED"
  | "STORAGE_FAILED"
  | "INTERNAL";

export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode;
  readonly status: number;
  /** Extra context attached to Sentry reports. Must never contain secrets. */
  readonly context: Record<string, unknown>;

  constructor(
    code: ApplicationErrorCode,
    message: string,
    options: { status: number; cause?: unknown; context?: Record<string, unknown> },
  ) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.status = options.status;
    this.context = options.context ?? {};
  }
}

export class UnauthorizedError extends ApplicationError {
  constructor(message = "You need to sign in to continue.", cause?: unknown) {
    super("UNAUTHORIZED", message, { status: 401, cause });
  }
}

export class ForbiddenError extends ApplicationError {
  constructor(
    message = "You do not have access to this resource.",
    context?: Record<string, unknown>,
  ) {
    super("FORBIDDEN", message, { status: 403, context });
  }
}

export class NotFoundError extends ApplicationError {
  constructor(message = "We could not find what you were looking for.") {
    super("NOT_FOUND", message, { status: 404 });
  }
}

export class ValidationError extends ApplicationError {
  /** Field-level messages, safe to render next to form inputs. */
  readonly fieldErrors: Record<string, string[]>;

  constructor(
    message = "Please check the highlighted fields and try again.",
    fieldErrors: Record<string, string[]> = {},
  ) {
    super("VALIDATION", message, { status: 400 });
    this.fieldErrors = fieldErrors;
  }
}

export class BillingRequiredError extends ApplicationError {
  /** Checkout URL the client opens when the user chooses to upgrade. */
  readonly checkoutUrl: string | null;
  readonly reason: "NO_SUBSCRIPTION" | "QUOTA_EXCEEDED";

  constructor(options: {
    message?: string;
    checkoutUrl?: string | null;
    reason?: "NO_SUBSCRIPTION" | "QUOTA_EXCEEDED";
    context?: Record<string, unknown>;
  } = {}) {
    super(
      "BILLING_REQUIRED",
      options.message ?? "This workspace needs an active plan to continue.",
      { status: 402, context: options.context },
    );
    this.checkoutUrl = options.checkoutUrl ?? null;
    this.reason = options.reason ?? "NO_SUBSCRIPTION";
  }
}

export class RateLimitError extends ApplicationError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, message = "Too many requests. Please slow down.") {
    super("RATE_LIMITED", message, { status: 429 });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class GenerationError extends ApplicationError {
  constructor(
    message = "Speech generation failed. Please try again.",
    cause?: unknown,
    context?: Record<string, unknown>,
  ) {
    super("GENERATION_FAILED", message, { status: 502, cause, context });
  }
}

export class StorageError extends ApplicationError {
  constructor(
    message = "We could not store or retrieve that audio file.",
    cause?: unknown,
    context?: Record<string, unknown>,
  ) {
    super("STORAGE_FAILED", message, { status: 502, cause, context });
  }
}

export function isApplicationError(error: unknown): error is ApplicationError {
  return error instanceof ApplicationError;
}

/**
 * Shape returned by server actions. Actions never throw across the RSC
 * boundary — a thrown error in production is replaced by an opaque digest,
 * which would lose the billing checkout URL and field errors.
 */
export type ActionFailure = {
  ok: false;
  code: ApplicationErrorCode;
  message: string;
  fieldErrors?: Record<string, string[]>;
  checkoutUrl?: string | null;
};

export type ActionSuccess<T> = { ok: true; data: T };
export type ActionResult<T> = ActionSuccess<T> | ActionFailure;

/** Converts any thrown value into a serialisable, secret-free action failure. */
export function toActionFailure(error: unknown): ActionFailure {
  if (error instanceof ValidationError) {
    return {
      ok: false,
      code: error.code,
      message: error.message,
      fieldErrors: error.fieldErrors,
    };
  }

  if (error instanceof BillingRequiredError) {
    return {
      ok: false,
      code: error.code,
      message: error.message,
      checkoutUrl: error.checkoutUrl,
    };
  }

  if (isApplicationError(error)) {
    return { ok: false, code: error.code, message: error.message };
  }

  return {
    ok: false,
    code: "INTERNAL",
    message: "Something went wrong on our end. Please try again.",
  };
}

export const actionSuccess = <T>(data: T): ActionSuccess<T> => ({ ok: true, data });
