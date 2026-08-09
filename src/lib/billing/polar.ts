import "server-only";

import { Polar } from "@polar-sh/sdk";

import { evaluateEntitlement } from "@/lib/billing/mock";
import {
  FREE_TIER_ALLOWANCE,
  type BillingMeter,
  type BillingProvider,
  type CheckoutInput,
  type EntitlementCheck,
  type OrganizationEntitlement,
  type PlanTier,
  type RecordUsageInput,
} from "@/lib/billing/types";
import {
  appendUsageRecord,
  currentCalendarPeriod,
  getUsageTotals,
} from "@/lib/billing/usage";
import { ApplicationError } from "@/lib/errors";
import { captureException } from "@/lib/observability";

export type PolarBillingConfig = {
  accessToken: string;
  server: "production" | "sandbox";
  /** Product customers are sent to when they need to upgrade. */
  productId: string | null;
};

/** Meter names as they appear in the Polar dashboard. */
const POLAR_EVENT_NAMES: Record<BillingMeter, string> = {
  CHARACTERS: "resonance.characters_generated",
  VOICE_CREATION: "resonance.voice_created",
};

/**
 * Polar-backed billing.
 *
 * The Clerk organization id is used as Polar's `externalCustomerId`, so billing
 * is per workspace with no extra mapping table.
 *
 * Entitlement reads are resilient: usage always comes from the local ledger and
 * only the *plan* comes from Polar. If Polar is unreachable we fall back to the
 * free allowance and mark the result `degraded` rather than either blocking
 * paying customers or handing out unlimited GPU time.
 */
export class PolarBillingProvider implements BillingProvider {
  readonly kind = "polar" as const;

  private readonly polar: Polar;
  private readonly productNames = new Map<string, string>();

  constructor(private readonly config: PolarBillingConfig) {
    this.polar = new Polar({
      accessToken: config.accessToken,
      server: config.server,
    });
  }

  async getOrganizationEntitlement(
    organizationId: string,
  ): Promise<OrganizationEntitlement> {
    const subscription = await this.findActiveSubscription(organizationId);

    const period = subscription
      ? {
          start: subscription.currentPeriodStart,
          end: subscription.currentPeriodEnd,
        }
      : currentCalendarPeriod();

    const totals = await getUsageTotals(organizationId, period);

    if (!subscription) {
      return {
        active: true, // The free allowance is still a usable entitlement.
        tier: "free",
        planName: "Free",
        includedCharacters: FREE_TIER_ALLOWANCE.characters,
        includedVoices: FREE_TIER_ALLOWANCE.voices,
        usedCharacters: totals.characters,
        usedVoices: totals.voices,
        periodStart: period.start,
        periodEnd: period.end,
        degraded: subscription === undefined ? true : undefined,
      };
    }

    return {
      active: true,
      tier: subscription.tier,
      planName: subscription.planName,
      // Paid plans are metered by Polar rather than capped here.
      includedCharacters: null,
      includedVoices: null,
      usedCharacters: totals.characters,
      usedVoices: totals.voices,
      periodStart: period.start,
      periodEnd: period.end,
    };
  }

  async checkEntitlement(
    organizationId: string,
    meter: BillingMeter,
    quantity: number,
  ): Promise<EntitlementCheck> {
    const entitlement = await this.getOrganizationEntitlement(organizationId);
    return evaluateEntitlement(entitlement, meter, quantity);
  }

  async recordUsage(input: RecordUsageInput): Promise<void> {
    // The local ledger is authoritative for quota enforcement, so it is written
    // first and its failure is fatal.
    await appendUsageRecord(input);

    try {
      await this.polar.events.ingest({
        events: [
          {
            name: POLAR_EVENT_NAMES[input.meter],
            externalCustomerId: input.organizationId,
            metadata: {
              quantity: input.quantity,
              ...(input.generationId ? { generation_id: input.generationId } : {}),
              ...(input.voiceId ? { voice_id: input.voiceId } : {}),
            },
          },
        ],
      });
    } catch (cause) {
      // A metering outage must not fail a generation the customer already paid
      // for in GPU time — the ledger lets us reconcile later.
      captureException(cause, {
        tags: { area: "billing", provider: "polar", operation: "ingest" },
        extra: { organizationId: input.organizationId, meter: input.meter },
      });
    }
  }

  async createCheckout(input: CheckoutInput): Promise<{ url: string }> {
    if (!this.config.productId) {
      throw new ApplicationError(
        "INTERNAL",
        "Checkout is not configured for this deployment.",
        { status: 500 },
      );
    }

    try {
      const checkout = await this.polar.checkouts.create({
        products: [this.config.productId],
        externalCustomerId: input.organizationId,
        customerEmail: input.userEmail ?? undefined,
        successUrl: input.successUrl,
        metadata: {
          clerk_organization_id: input.organizationId,
          clerk_user_id: input.userId,
        },
      });

      return { url: checkout.url };
    } catch (cause) {
      captureException(cause, {
        tags: { area: "billing", provider: "polar", operation: "checkout" },
        extra: { organizationId: input.organizationId },
      });
      throw new ApplicationError(
        "INTERNAL",
        "We could not open checkout. Please try again shortly.",
        { status: 502, cause },
      );
    }
  }

  async createCustomerPortalSession(
    organizationId: string,
  ): Promise<{ url: string } | null> {
    try {
      const session = await this.polar.customerSessions.create({
        externalCustomerId: organizationId,
      });
      return { url: session.customerPortalUrl };
    } catch (cause) {
      // A workspace that has never checked out has no Polar customer yet.
      captureException(cause, {
        tags: { area: "billing", provider: "polar", operation: "portal" },
        extra: { organizationId },
      });
      return null;
    }
  }

  /**
   * @returns the active subscription, `null` when the customer exists but has
   * none, or `undefined` when Polar could not be reached.
   */
  private async findActiveSubscription(organizationId: string): Promise<
    | {
        planName: string;
        tier: PlanTier;
        currentPeriodStart: Date;
        currentPeriodEnd: Date;
      }
    | null
    | undefined
  > {
    try {
      const state = await this.polar.customers.getStateExternal({
        externalId: organizationId,
      });

      const active = state.activeSubscriptions.find(
        (subscription) => subscription.status === "active",
      );
      if (!active) return null;

      // `CustomerState` carries only `productId`, so the display name needs a
      // second call. A failure there costs the plan's label, nothing more.
      const productName = await this.resolveProductName(active.productId);

      return {
        planName: productName ?? "Paid",
        tier: tierFromProductName(productName),
        currentPeriodStart: active.currentPeriodStart,
        currentPeriodEnd: active.currentPeriodEnd,
      };
    } catch (cause) {
      if (isNotFound(cause)) return null; // No Polar customer yet — free tier.
      captureException(cause, {
        tags: { area: "billing", provider: "polar", operation: "state" },
        extra: { organizationId },
      });
      return undefined;
    }
  }

  /** Product names change rarely, so one lookup per process is plenty. */
  private async resolveProductName(productId: string): Promise<string | undefined> {
    const cached = this.productNames.get(productId);
    if (cached !== undefined) return cached;

    try {
      const product = await this.polar.products.get({ id: productId });
      this.productNames.set(productId, product.name);
      return product.name;
    } catch {
      return undefined;
    }
  }
}

function isNotFound(error: unknown): boolean {
  const candidate = error as { statusCode?: number; status?: number };
  return candidate?.statusCode === 404 || candidate?.status === 404;
}

function tierFromProductName(name: string | undefined): PlanTier {
  const normalized = name?.toLowerCase() ?? "";
  if (normalized.includes("scale")) return "scale";
  if (normalized.includes("starter")) return "starter";
  if (normalized.includes("free")) return "free";
  return "unknown";
}
