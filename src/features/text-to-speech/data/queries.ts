import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { GenerationStatus } from "@/generated/prisma/enums";
import type { GenerationModel } from "@/generated/prisma/models";
import type { GenerationSummary } from "@/features/text-to-speech/types";
import { database } from "@/lib/database";

/**
 * Organization-scoped generation reads. `organizationId` always comes from the
 * Clerk session — there is deliberately no "find by id" without a tenant.
 */

export function toGenerationSummary(generation: GenerationModel): GenerationSummary {
  return {
    id: generation.id,
    text: generation.text,
    voiceId: generation.voiceId,
    voiceName: generation.voiceName,
    status: generation.status,
    errorMessage: generation.errorMessage,
    characterCount: generation.characterCount,
    durationSecs: generation.durationSecs,
    temperature: generation.temperature,
    topP: generation.topP,
    topK: generation.topK,
    repetitionPenalty: generation.repetitionPenalty,
    hasAudio: generation.r2ObjectKey !== null && generation.status === "COMPLETED",
    createdAt: generation.createdAt.toISOString(),
  };
}

export async function findGeneration(
  organizationId: string,
  generationId: string,
): Promise<GenerationModel | null> {
  return database.generation.findFirst({
    where: { id: generationId, organizationId },
  });
}

export const HISTORY_PAGE_SIZE = 20;

export type HistoryPage = {
  items: GenerationSummary[];
  nextCursor: string | null;
};

export async function listGenerations(
  organizationId: string,
  options: {
    cursor?: string;
    status?: GenerationStatus;
    search?: string;
    take?: number;
  } = {},
): Promise<HistoryPage> {
  const take = options.take ?? HISTORY_PAGE_SIZE;

  const filters: Prisma.GenerationWhereInput[] = [{ organizationId }];
  if (options.status) filters.push({ status: options.status });
  if (options.search?.trim()) {
    const term = options.search.trim();
    filters.push({
      OR: [
        { text: { contains: term, mode: "insensitive" } },
        { voiceName: { contains: term, mode: "insensitive" } },
      ],
    });
  }

  // Fetch one extra row to learn whether another page exists without a count.
  const rows = await database.generation.findMany({
    where: { AND: filters },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(options.cursor
      ? { cursor: { id: options.cursor }, skip: 1 }
      : {}),
  });

  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;

  return {
    items: items.map(toGenerationSummary),
    nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
  };
}

export type GenerationStats = {
  total: number;
  completed: number;
  failed: number;
  charactersThisPeriod: number;
};

export async function getGenerationStats(
  organizationId: string,
  since: Date,
): Promise<GenerationStats> {
  const [total, completed, failed, characters] = await Promise.all([
    database.generation.count({ where: { organizationId } }),
    database.generation.count({ where: { organizationId, status: "COMPLETED" } }),
    database.generation.count({ where: { organizationId, status: "FAILED" } }),
    database.generation.aggregate({
      where: { organizationId, status: "COMPLETED", createdAt: { gte: since } },
      _sum: { characterCount: true },
    }),
  ]);

  return {
    total,
    completed,
    failed,
    charactersThisPeriod: characters._sum.characterCount ?? 0,
  };
}
