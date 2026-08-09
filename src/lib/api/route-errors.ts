import "server-only";

import { NextResponse } from "next/server";

import { isApplicationError } from "@/lib/errors";
import { captureException } from "@/lib/observability";

/**
 * Maps a thrown error to a safe JSON response.
 *
 * Only `ApplicationError` messages reach the client — every other error becomes
 * a generic 500, so no stack trace, SQL fragment or upstream detail leaks.
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
      { error: { code: error.code, message: error.message } },
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
