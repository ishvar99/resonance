"use server";

import { currentUser } from "@clerk/nextjs/server";

import { requireAuthContext } from "@/lib/auth/context";
import { getBillingProvider } from "@/lib/billing";
import { safelyCreateCheckoutUrl } from "@/lib/billing/checkout";
import {
  ApplicationError,
  actionSuccess,
  toActionFailure,
  type ActionResult,
} from "@/lib/errors";
import { captureException } from "@/lib/observability";

/** Opens checkout for the current workspace. */
export async function createCheckoutAction(): Promise<ActionResult<{ url: string }>> {
  try {
    const { organizationId, userId, organizationSlug } = await requireAuthContext();
    const user = await currentUser();

    const url = await safelyCreateCheckoutUrl({
      organizationId,
      userId,
      organizationName: organizationSlug,
      userEmail: user?.primaryEmailAddress?.emailAddress ?? null,
    });

    if (!url) {
      throw new ApplicationError(
        "INTERNAL",
        "Checkout is unavailable right now. Please try again shortly.",
        { status: 502 },
      );
    }

    return actionSuccess({ url });
  } catch (error) {
    captureException(error, { tags: { area: "billing", operation: "checkout" } });
    return toActionFailure(error);
  }
}

/** Opens the provider's customer portal for an existing subscription. */
export async function openBillingPortalAction(): Promise<
  ActionResult<{ url: string }>
> {
  try {
    const { organizationId } = await requireAuthContext();
    const session =
      await getBillingProvider().createCustomerPortalSession(organizationId);

    if (!session) {
      throw new ApplicationError(
        "NOT_FOUND",
        "This workspace has no billing account yet. Upgrade first to manage billing.",
        { status: 404 },
      );
    }

    return actionSuccess({ url: session.url });
  } catch (error) {
    captureException(error, { tags: { area: "billing", operation: "portal" } });
    return toActionFailure(error);
  }
}
