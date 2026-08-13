import "server-only";

import { NextResponse } from "next/server";

import { ValidationError, isApplicationError } from "@/lib/errors";
import { captureException } from "@/lib/observability";

/**
 * Maps a thrown error to a safe JSON response.
 *
 * Only `ApplicationError` messages reach the client — every other error becomes
 * a generic 500, so no stack trace, SQL fragment or upstream detail leaks.
 * Validation failures additionally carry their field errors: they are written
 * for users, and an API caller cannot fix a 400 they cannot see.
 */
export function toErrorResponse(
  error: unknown,
  context?: { area: string; operation: string },
): NextResponse {
  captureException(error, {
    tags: context ? { area: context.area, operation: context.operation } : undefined,
  });

  if (isApplicationError(error)) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error instanceof ValidationError &&
          Object.keys(error.fieldErrors).length > 0
            ? { details: error.fieldErrors }
            : {}),
        },
      },
      {
        status: error.status,
        headers:
          error.code === "RATE_LIMITED" && "retryAfterSeconds" in error
            ? { "Retry-After": String((error as { retryAfterSeconds: number }).retryAfterSeconds) }
            : undefined,
      },
    );
  }

  return NextResponse.json(
    { error: { code: "INTERNAL", message: "Something went wrong." } },
    { status: 500 },
  );
}
