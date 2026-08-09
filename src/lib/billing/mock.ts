import "server-only";

import {
  appendUsageRecord,
  currentCalendarPeriod,
  getUsageTotals,
} from "@/lib/billing/usage";
import {
  FREE_TIER_ALLOWANCE,
  type BillingMeter,
  type BillingProvider,
  type EntitlementCheck,
  type OrganizationEntitlement,
  type RecordUsageInput,
} from "@/lib/billing/types";
import { env } from "@/lib/environment";

/**
 * Development billing provider.
 *
 * It is NOT a no-op: usage is written to the real local ledger and the free-tier
 * limits are genuinely enforced, so the "upgrade required" path can be exercised
 * end to end without Polar credentials. Only the checkout redirect is simulated.
 *
 * `createBillingProvider()` refuses to select this adapter in production.
 */
export class MockBillingProvider implements BillingProvider {
  readonly kind = "mock" as const;

  async getOrganizationEntitlement(
    organizationId: string,
  ): Promise<OrganizationEntitlement> {
    const period = currentCalendarPeriod();
    const totals = await getUsageTotals(organizationId, period);

    return {
      active: true,
      tier: "free",
      planName: "Free (development)",
      includedCharacters: FREE_TIER_ALLOWANCE.characters,
      includedVoices: FREE_TIER_ALLOWANCE.voices,
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
    await appendUsageRecord(input);
  }

  async createCheckout(): Promise<{ url: string }> {
    // Sends the user to the settings page with a banner rather than pretending
    // a payment happened.
    const url = new URL("/settings", env.APP_URL);
    url.searchParams.set("checkout", "unavailable");
    return { url: url.toString() };
  }

  async createCustomerPortalSession(): Promise<{ url: string } | null> {
    return null;
  }
}

/** Shared entitlement maths so Polar and development behave identically. */
export function evaluateEntitlement(
  entitlement: OrganizationEntitlement,
  meter: BillingMeter,
  quantity: number,
): EntitlementCheck {
  if (!entitlement.active) {
    return {
      allowed: false,
      reason: "NO_SUBSCRIPTION",
      message: "This workspace needs an active plan to generate speech.",
    };
  }

  const included =
    meter === "CHARACTERS"
      ? entitlement.includedCharacters
      : entitlement.includedVoices;

  // `null` means unmetered on this plan.
  if (included === null) return { allowed: true };

  const used =
    meter === "CHARACTERS" ? entitlement.usedCharacters : entitlement.usedVoices;

  if (used + quantity > included) {
    return {
      allowed: false,
      reason: "QUOTA_EXCEEDED",
      message:
        meter === "CHARACTERS"
          ? `This request needs ${quantity.toLocaleString()} characters but only ${Math.max(
              0,
              included - used,
            ).toLocaleString()} remain on the ${entitlement.planName} plan this period.`
          : `The ${entitlement.planName} plan includes ${included} custom voices and this workspace has used ${used}.`,
    };
  }

  return { allowed: true };
}
