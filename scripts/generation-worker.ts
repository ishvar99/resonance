/**
 * Resonance generation worker.
 *
 *   npm run worker
 *
 * Long-running process that drains queued generations: claim → Chatterbox →
 * storage → COMPLETED (or retry with backoff, then FAILED). Deploy it as a
 * second service/process next to the web app — Railway-style — sharing the
 * same environment. Scale by running more replicas; claims are contention-free
 * (`FOR UPDATE SKIP LOCKED`), so workers never fight over a job.
 *
 * Runs under tsx with `--conditions=react-server` (set in the npm script) so
 * the app's `server-only` modules resolve; the full app environment is
 * required and validated — a worker with missing credentials must crash at
 * boot exactly like the web app would.
 */

import "dotenv/config";

import { randomBytes } from "node:crypto";

import { processClaimedGeneration } from "../src/features/text-to-speech/server/pipeline";
import {
  claimNextGeneration,
  recoverStaleClaims,
  rescheduleForRetry,
} from "../src/features/text-to-speech/server/queue";
import { database } from "../src/lib/database";
import { GenerationError, isApplicationError } from "../src/lib/errors";
import { captureException } from "../src/lib/observability";

const WORKER_ID = `worker-${process.pid}-${randomBytes(3).toString("hex")}`;
const IDLE_POLL_MS = 2_000;
const REAP_EVERY_MS = 60_000;

let shuttingDown = false;

async function processOne(): Promise<boolean> {
  const job = await claimNextGeneration(WORKER_ID);
  if (!job) return false;

  const startedAt = Date.now();
  console.info(
    `[${WORKER_ID}] processing ${job.id} (attempt ${job.attempts}, ${job.characterCount} chars)`,
  );

  try {
    await processClaimedGeneration(job);
    console.info(
      `[${WORKER_ID}] completed ${job.id} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
    );
  } catch (error) {
    captureException(error, {
      tags: { area: "worker", operation: "process" },
      extra: { generationId: job.id },
    });

    const message = isApplicationError(error)
      ? error.message
      : new GenerationError().message;

    // Everything at this stage is presumed transient: validation, ownership
    // and billing were settled at enqueue time, so what can fail here is the
    // GPU service, storage or the database — precisely the failures worth a
    // backoff. A genuinely permanent fault burns its MAX_ATTEMPTS and fails
    // with the same user-safe message it would have shown immediately.
    const decision = await rescheduleForRetry(job, message);

    console.warn(`[${WORKER_ID}] ${job.id} ${decision}: ${message}`);
  }

  return true;
}

async function main() {
  console.info(`[${WORKER_ID}] started — polling for queued generations`);
  let lastReap = 0;

  while (!shuttingDown) {
    try {
      if (Date.now() - lastReap > REAP_EVERY_MS) {
        lastReap = Date.now();
        const recovered = await recoverStaleClaims();
        if (recovered > 0) {
          console.warn(`[${WORKER_ID}] requeued ${recovered} stale claim(s)`);
        }
      }

      const worked = await processOne();
      if (!worked && !shuttingDown) {
        await new Promise((resolve) => setTimeout(resolve, IDLE_POLL_MS));
      }
    } catch (error) {
      // A poll-loop error (database hiccup, network) must not kill the worker.
      captureException(error, { tags: { area: "worker", operation: "loop" } });
      console.error(`[${WORKER_ID}] loop error:`, error);
      await new Promise((resolve) => setTimeout(resolve, IDLE_POLL_MS));
    }
  }

  await database.$disconnect();
  console.info(`[${WORKER_ID}] stopped`);
}

// Finish the in-flight job, then exit — the platform's SIGKILL grace period is
// the hard deadline, and the stale-claim reaper covers anything cut short.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (shuttingDown) process.exit(1); // second signal: force
    console.info(`[${WORKER_ID}] ${signal} — finishing current job, then exiting`);
    shuttingDown = true;
  });
}

main().catch((error) => {
  console.error("Worker crashed:", error);
  process.exitCode = 1;
});
