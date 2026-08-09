import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { NextResponse } from "next/server";

import { env } from "@/lib/environment";
import { captureException } from "@/lib/observability";

export const dynamic = "force-dynamic";

/**
 * Polar webhook receiver.
 *
 * Public (excluded from the auth proxy) but authenticated by signature —
 * `validateEvent` verifies the Standard Webhooks HMAC against
 * `POLAR_WEBHOOK_SECRET`, so an unsigned request is rejected before it is
 * parsed.
 *
 * Entitlement is read live from Polar on each check, so this handler does not
 * need to mirror subscription state locally. It exists to acknowledge delivery
 * and to make lifecycle events observable.
 */
export async function POST(request: Request) {
  if (!env.POLAR_WEBHOOK_SECRET) {
    // Refuse rather than accept unverifiable events.
    return NextResponse.json(
      { error: "Webhooks are not configured." },
      { status: 503 },
    );
  }

  const body = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let event: ReturnType<typeof validateEvent>;
  try {
    event = validateEvent(body, headers, env.POLAR_WEBHOOK_SECRET);
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 403 });
    }
    captureException(error, { tags: { area: "billing", operation: "webhook" } });
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  switch (event.type) {
    case "subscription.active":
    case "subscription.updated":
    case "subscription.canceled":
    case "subscription.revoked":
    case "order.paid":
      // The organization id is Polar's `externalCustomerId`; log it so billing
      // changes are traceable without storing a duplicate copy of plan state.
      console.info(
        "[resonance] polar webhook %s for external customer %s",
        event.type,
        "data" in event && event.data && "customer" in event.data
          ? ((event.data.customer as { externalId?: string | null })?.externalId ??
            "unknown")
          : "unknown",
      );
      break;
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
