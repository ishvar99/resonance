import "server-only";

import { MockBillingProvider } from "@/lib/billing/mock";
import { PolarBillingProvider } from "@/lib/billing/polar";
import type { BillingProvider } from "@/lib/billing/types";
import { env, isProduction } from "@/lib/environment";

export type {
  BillingMeter,
  BillingProvider,
  EntitlementCheck,
  OrganizationEntitlement,
  PlanTier,
} from "@/lib/billing/types";
export { FREE_TIER_ALLOWANCE } from "@/lib/billing/types";

function createBillingProvider(): BillingProvider {
  if (env.POLAR_ACCESS_TOKEN) {
    return new PolarBillingProvider({
      accessToken: env.POLAR_ACCESS_TOKEN,
      server: env.POLAR_SERVER,
      productId: env.POLAR_PRODUCT_ID ?? null,
    });
  }

  if (isProduction()) {
    throw new Error(
      "Billing is not configured. Set POLAR_ACCESS_TOKEN — the development billing provider is disabled in production.",
    );
  }

  console.warn(
    "[resonance] Polar is not configured — using the development billing provider (free-tier limits are still enforced).",
  );
  return new MockBillingProvider();
}

const globalForBilling = globalThis as unknown as {
  resonanceBilling?: BillingProvider;
};

/** Lazily constructed — see the note on `getStorage()` for why. */
export function getBillingProvider(): BillingProvider {
  globalForBilling.resonanceBilling ??= createBillingProvider();
  return globalForBilling.resonanceBilling;
}
