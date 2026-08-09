import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { VoiceModel } from "@/generated/prisma/models";
import type { VoiceCategory, VoiceVariant } from "@/generated/prisma/enums";
import type { VoiceSummary } from "@/features/voices/types";
import { database } from "@/lib/database";

/**
 * Organization-scoped voice reads.
 *
 * Every function here takes `organizationId` as its first argument and it must
 * come from `requireAuthContext()`. The visibility rule is expressed once, in
 * `accessibleVoiceFilter`, so it cannot drift between call sites.
 */

/** SYSTEM voices (global) plus this organization's own CUSTOM voices. */
export function accessibleVoiceFilter(
  organizationId: string,
): Prisma.VoiceWhereInput {
  return {
    OR: [
      { variant: "SYSTEM", organizationId: null },
      { variant: "CUSTOM", organizationId },
    ],
  };
}

export function toVoiceSummary(voice: VoiceModel): VoiceSummary {
  return {
    id: voice.id,
    name: voice.name,
    description: voice.description,
    category: voice.category,
    language: voice.language,
    variant: voice.variant,
    hasSample: voice.r2ObjectKey !== null,
    createdAt: voice.createdAt.toISOString(),
  };
}

export type ListVoicesOptions = {
  search?: string;
  category?: VoiceCategory;
  variant?: VoiceVariant;
};

export async function listVoices(
  organizationId: string,
  options: ListVoicesOptions = {},
): Promise<VoiceSummary[]> {
  const filters: Prisma.VoiceWhereInput[] = [accessibleVoiceFilter(organizationId)];

  if (options.search?.trim()) {
    const term = options.search.trim();
    filters.push({
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { description: { contains: term, mode: "insensitive" } },
      ],
    });
  }

  if (options.category) filters.push({ category: options.category });
  if (options.variant) filters.push({ variant: options.variant });

  const voices = await database.voice.findMany({
    where: { AND: filters },
    orderBy: [
      // Workspace voices first — they are what the user came to find.
      { variant: "asc" },
      { name: "asc" },
    ],
  });

  return voices.map(toVoiceSummary);
}

/**
 * Loads a voice the organization is allowed to use.
 *
 * Returns `null` for a voice belonging to another organization — deliberately
 * indistinguishable from "does not exist", so ids cannot be probed.
 */
export async function findAccessibleVoice(
  organizationId: string,
  voiceId: string,
): Promise<VoiceModel | null> {
  return database.voice.findFirst({
    where: { AND: [{ id: voiceId }, accessibleVoiceFilter(organizationId)] },
  });
}

/** Custom voices only — used by delete, which must never touch system voices. */
export async function findOwnedCustomVoice(
  organizationId: string,
  voiceId: string,
): Promise<VoiceModel | null> {
  return database.voice.findFirst({
    where: { id: voiceId, variant: "CUSTOM", organizationId },
  });
}

export async function countCustomVoices(organizationId: string): Promise<number> {
  return database.voice.count({
    where: { variant: "CUSTOM", organizationId },
  });
}

export type VoiceCounts = { system: number; custom: number };

export async function countVoicesByVariant(
  organizationId: string,
): Promise<VoiceCounts> {
  const [system, custom] = await Promise.all([
    database.voice.count({ where: { variant: "SYSTEM", organizationId: null } }),
    database.voice.count({ where: { variant: "CUSTOM", organizationId } }),
  ]);
  return { system, custom };
}
