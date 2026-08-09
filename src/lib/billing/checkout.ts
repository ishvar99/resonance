import "server-only";

import { getBillingProvider } from "@/lib/billing";
import type { BillingMeter } from "@/lib/billing/types";
import { env } from "@/lib/environment";
import { BillingRequiredError } from "@/lib/errors";
import { captureException } from "@/lib/observability";

/**
 * Gate placed in front of every billable operation.
 *
 * Called *before* any GPU work or storage write, so an out-of-quota workspace
 * never costs an inference. On failure it throws a `BillingRequiredError`
 * carrying a checkout URL, which the client turns into an "Upgrade" toast
 * action.
 */
export async function requireEntitlement(options: {
  organizationId: string;
  userId: string;
  meter: BillingMeter;
  quantity: number;
  userEmail?: string | null;
  organizationName?: string | null;
  /** Where Polar returns the user after a successful checkout. */
  successPath?: string;
}): Promise<void> {
  const check = await getBillingProvider().checkEntitlement(
    options.organizationId,
    options.meter,
    options.quantity,
  );

  if (check.allowed) return;

  const checkoutUrl = await safelyCreateCheckoutUrl({
    organizationId: options.organizationId,
    organizationName: options.organizationName,
    userId: options.userId,
    userEmail: options.userEmail,
    successPath: options.successPath,
  });

  throw new BillingRequiredError({
    message: check.message,
    reason: check.reason,
    checkoutUrl,
    context: {
      organizationId: options.organizationId,
      meter: options.meter,
      reason: check.reason,
    },
  });
}

/**
 * Builds a checkout URL, returning `null` rather than throwing — a checkout
 * outage should still produce a clear "you're out of quota" message rather than
 * a generic error.
 */
export async function safelyCreateCheckoutUrl(options: {
  organizationId: string;
  userId: string;
  organizationName?: string | null;
  userEmail?: string | null;
  successPath?: string;
}): Promise<string | null> {
  try {
    const successUrl = new URL(
      options.successPath ?? "/settings?checkout=success",
      env.APP_URL,
    ).toString();

    const { url } = await getBillingProvider().createCheckout({
      organizationId: options.organizationId,
      organizationName: options.organizationName ?? null,
      userId: options.userId,
      userEmail: options.userEmail ?? null,
      successUrl,
    });
    return url;
  } catch (cause) {
    captureException(cause, {
      tags: { area: "billing", operation: "checkout" },
      extra: { organizationId: options.organizationId },
    });
    return null;
  }
}
