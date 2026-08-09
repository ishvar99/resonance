/**
 * Billing contract.
 *
 * Entitlement is checked *before* any GPU work happens, so an out-of-quota
 * organization never costs us an inference. Usage is recorded after the work
 * succeeds.
 */

export type BillingMeter = "CHARACTERS" | "VOICE_CREATION";

export type PlanTier = "free" | "starter" | "scale" | "unknown";

export type OrganizationEntitlement = {
  /** Whether the workspace can currently perform billable work at all. */
  active: boolean;
  tier: PlanTier;
  planName: string;

  /** `null` means unmetered for that dimension. */
  includedCharacters: number | null;
  includedVoices: number | null;

  usedCharacters: number;
  usedVoices: number;

  periodStart: Date;
  periodEnd: Date;

  /** Set when the provider could not be reached and defaults were assumed. */
  degraded?: boolean;
};

export type EntitlementCheck =
  | { allowed: true }
  | {
      allowed: false;
      reason: "NO_SUBSCRIPTION" | "QUOTA_EXCEEDED";
      message: string;
    };

export type RecordUsageInput = {
  organizationId: string;
  meter: BillingMeter;
  quantity: number;
  generationId?: string;
  voiceId?: string;
  /** Idempotency key so a retried action does not double-bill. */
  idempotencyKey?: string;
};

export type CheckoutInput = {
  organizationId: string;
  organizationName?: string | null;
  userId: string;
  userEmail?: string | null;
  successUrl: string;
};

export interface BillingProvider {
  readonly kind: "polar" | "mock";

  getOrganizationEntitlement(
    organizationId: string,
  ): Promise<OrganizationEntitlement>;

  /** Called before expensive work. Never mutates state. */
  checkEntitlement(
    organizationId: string,
    meter: BillingMeter,
    quantity: number,
  ): Promise<EntitlementCheck>;

  recordUsage(input: RecordUsageInput): Promise<void>;

  createCheckout(input: CheckoutInput): Promise<{ url: string }>;

  /** Customer portal for managing an existing subscription, when available. */
  createCustomerPortalSession(
    organizationId: string,
  ): Promise<{ url: string } | null>;
}

/**
 * Free allowance granted to every workspace. Kept here (rather than in the
 * provider) because both the Polar and development providers honour it, and the
 * settings page renders it.
 */
export const FREE_TIER_ALLOWANCE = {
  characters: 10_000,
  voices: 3,
} as const;
