import { Prisma } from "@/generated/prisma/client";
import type { GenerationModel } from "@/generated/prisma/models";
import { database } from "@/lib/database";

/**
 * Postgres-backed job queue over the Generation table.
 *
 * There is deliberately no Redis here: `FOR UPDATE SKIP LOCKED` gives
 * exactly-once claiming across any number of workers, the job row is the
 * generation row (no state to keep in sync), and Railway-style deployments get
 * a queue for free with the database they already run. Swap this file for a
 * real broker if throughput ever demands it — the worker loop only speaks
 * `claimNextGeneration` / `rescheduleForRetry`.
 *
 * No `server-only` import: the worker runs this under tsx.
 */

export const MAX_ATTEMPTS = 3;

/** PROCESSING rows older than this are presumed orphaned by a dead worker. */
export const STALE_CLAIM_MINUTES = 10;

/** 30s, 60s, 120s… capped — enough to ride out a Chatterbox restart. */
export function nextBackoffMs(attempts: number): number {
  const base = 30_000 * 2 ** Math.max(0, attempts - 1);
  return Math.min(base, 10 * 60_000);
}

/**
 * Atomically claims the oldest runnable PENDING job.
 *
 * The subquery + `FOR UPDATE SKIP LOCKED` means concurrent workers (and the
 * inline fast-path, which claims by primary key) can never grab the same row:
 * a locked candidate is skipped rather than waited on, so claiming is
 * contention-free. Returns null when the queue is empty.
 */
export async function claimNextGeneration(
  workerId: string,
): Promise<GenerationModel | null> {
  const rows = await database.$queryRaw<GenerationModel[]>(Prisma.sql`
    UPDATE "Generation"
    SET "status"    = 'PROCESSING',
        "claimedAt" = now(),
        "claimedBy" = ${workerId},
        "attempts"  = "attempts" + 1,
        "updatedAt" = now()
    WHERE "id" = (
      SELECT "id" FROM "Generation"
      WHERE "status" = 'PENDING' AND "availableAt" <= now()
      ORDER BY "createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);

  return rows[0] ?? null;
}

/**
 * Returns orphaned PROCESSING rows to the queue.
 *
 * A worker that dies mid-generation leaves its claim behind; without this,
 * that generation would show "processing" forever. Rows out of attempts are
 * failed with an honest message instead of being retried into the same crash.
 */
export async function recoverStaleClaims(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_CLAIM_MINUTES * 60_000);

  const { count: requeued } = await database.generation.updateMany({
    where: {
      status: "PROCESSING",
      claimedAt: { lt: cutoff },
      attempts: { lt: MAX_ATTEMPTS },
    },
    data: { status: "PENDING", claimedAt: null, claimedBy: null },
  });

  await database.generation.updateMany({
    where: {
      status: "PROCESSING",
      claimedAt: { lt: cutoff },
      attempts: { gte: MAX_ATTEMPTS },
    },
    data: {
      status: "FAILED",
      errorMessage:
        "Generation was interrupted repeatedly. Please try again.",
      claimedAt: null,
      claimedBy: null,
    },
  });

  return requeued;
}

/**
 * Puts a failed-but-retryable job back in the queue with backoff, or fails it
 * for good once attempts are spent. Returns what it decided.
 */
export async function rescheduleForRetry(
  generation: GenerationModel,
  errorMessage: string,
): Promise<"retried" | "failed"> {
  if (generation.attempts >= MAX_ATTEMPTS) {
    await database.generation.update({
      where: { id: generation.id },
      data: {
        status: "FAILED",
        errorMessage,
        claimedAt: null,
        claimedBy: null,
      },
    });
    return "failed";
  }

  await database.generation.update({
    where: { id: generation.id },
    data: {
      status: "PENDING",
      availableAt: new Date(Date.now() + nextBackoffMs(generation.attempts)),
      claimedAt: null,
      claimedBy: null,
      // Keep the latest error visible while the job waits for its retry.
      errorMessage,
    },
  });
  return "retried";
}
