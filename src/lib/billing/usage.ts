import "server-only";

import { database } from "@/lib/database";
import type { BillingMeter } from "@/lib/billing/types";

/**
 * Local usage ledger.
 *
 * Usage is written here first and mirrored to the billing provider. Keeping a
 * local copy means the usage a customer sees is correct even when the provider
 * is unreachable, and gives us something to reconcile against.
 */

export type BillingPeriod = { start: Date; end: Date };

/** Calendar-month period, used when a workspace has no subscription of its own. */
export function currentCalendarPeriod(now = new Date()): BillingPeriod {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  );
  return { start, end };
}

export type UsageTotals = {
  characters: number;
  voices: number;
};

/** Sums the ledger for one organization over one period. */
export async function getUsageTotals(
  organizationId: string,
  period: BillingPeriod,
): Promise<UsageTotals> {
  const rows = await database.usageRecord.groupBy({
    by: ["kind"],
    where: {
      organizationId,
      createdAt: { gte: period.start, lt: period.end },
    },
    _sum: { quantity: true },
  });

  const totals: UsageTotals = { characters: 0, voices: 0 };
  for (const row of rows) {
    if (row.kind === "CHARACTERS") totals.characters = row._sum.quantity ?? 0;
    if (row.kind === "VOICE_CREATION") totals.voices = row._sum.quantity ?? 0;
  }
  return totals;
}

/**
 * Appends to the ledger.
 *
 * `idempotencyKey` makes a retried server action safe: the unique index on
 * `externalEventId` turns the second write into a no-op instead of double
 * counting a generation.
 */
export async function appendUsageRecord(input: {
  organizationId: string;
  meter: BillingMeter;
  quantity: number;
  generationId?: string;
  voiceId?: string;
  idempotencyKey?: string;
}): Promise<void> {
  if (input.quantity <= 0) return;

  if (input.idempotencyKey) {
    await database.usageRecord.upsert({
      where: { externalEventId: input.idempotencyKey },
      create: {
        organizationId: input.organizationId,
        kind: input.meter,
        quantity: input.quantity,
        generationId: input.generationId ?? null,
        voiceId: input.voiceId ?? null,
        externalEventId: input.idempotencyKey,
      },
      update: {},
    });
    return;
  }

  await database.usageRecord.create({
    data: {
      organizationId: input.organizationId,
      kind: input.meter,
      quantity: input.quantity,
      generationId: input.generationId ?? null,
      voiceId: input.voiceId ?? null,
    },
  });
}
