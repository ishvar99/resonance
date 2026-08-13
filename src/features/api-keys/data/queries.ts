import "server-only";

import type { ApiKeyModel } from "@/generated/prisma/models";
import type { ApiKeySummary } from "@/features/api-keys/types";
import { database } from "@/lib/database";

/** Active keys allowed per organization — a sanity bound, not a billing limit. */
export const MAX_ACTIVE_API_KEYS = 10;

export function toApiKeySummary(key: ApiKeyModel): ApiKeySummary {
  return {
    id: key.id,
    name: key.name,
    maskedKey: `${key.prefix}…${key.last4}`,
    createdAt: key.createdAt.toISOString(),
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
  };
}

/** Active keys for the organization, newest first. Revoked keys are hidden. */
export async function listApiKeys(organizationId: string): Promise<ApiKeySummary[]> {
  const keys = await database.apiKey.findMany({
    where: { organizationId, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return keys.map(toApiKeySummary);
}

export async function countActiveApiKeys(organizationId: string): Promise<number> {
  return database.apiKey.count({ where: { organizationId, revokedAt: null } });
}
