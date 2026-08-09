import { describe, expect, it } from "vitest";

import {
  BillingRequiredError,
  ForbiddenError,
  GenerationError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  toActionFailure,
} from "@/lib/errors";

/**
 * Server actions must never leak internals across the RSC boundary — and they
 * must preserve the two pieces of structure the UI depends on: field errors and
 * the billing checkout URL.
 */

describe("action failure mapping", () => {
  it("maps auth errors to their status codes", () => {
    expect(new UnauthorizedError().status).toBe(401);
    expect(new ForbiddenError().status).toBe(403);
    expect(new NotFoundError().status).toBe(404);
  });

  it("preserves field errors so forms can highlight inputs", () => {
    const failure = toActionFailure(
      new ValidationError("Check the fields.", { name: ["Too short."] }),
    );

    expect(failure.code).toBe("VALIDATION");
    expect(failure.fieldErrors).toEqual({ name: ["Too short."] });
  });

  it("preserves the checkout URL so the toast can offer an upgrade", () => {
    const failure = toActionFailure(
      new BillingRequiredError({
        message: "Out of characters.",
        checkoutUrl: "https://polar.sh/checkout/abc",
        reason: "QUOTA_EXCEEDED",
      }),
    );

    expect(failure.code).toBe("BILLING_REQUIRED");
    expect(failure.checkoutUrl).toBe("https://polar.sh/checkout/abc");
    expect(failure.message).toBe("Out of characters.");
  });

  it("replaces unknown errors with a generic message", () => {
    const failure = toActionFailure(
      new Error("connect ECONNREFUSED 10.0.0.5:5432 password=hunter2"),
    );

    expect(failure.code).toBe("INTERNAL");
    expect(failure.message).not.toContain("ECONNREFUSED");
    expect(failure.message).not.toContain("hunter2");
  });

  it("keeps the cause server-side while exposing a safe message", () => {
    const cause = new Error("upstream 500: Traceback (most recent call last)…");
    const error = new GenerationError(undefined, cause);

    expect(error.cause).toBe(cause);
    expect(toActionFailure(error).message).not.toContain("Traceback");
  });

  it("never includes a stack trace in the serialised failure", () => {
    const failure = toActionFailure(new Error("boom"));
    expect(JSON.stringify(failure)).not.toContain("at ");
  });
});
