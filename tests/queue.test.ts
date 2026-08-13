import { describe, expect, it } from "vitest";

import {
  MAX_ATTEMPTS,
  STALE_CLAIM_MINUTES,
  nextBackoffMs,
} from "@/features/text-to-speech/server/queue";

/**
 * The claim/reap SQL is exercised live against Postgres (SKIP LOCKED cannot be
 * meaningfully unit-tested); what belongs here is the pure arithmetic the
 * worker's behavior hangs on.
 */
describe("retry backoff", () => {
  it("doubles per attempt from 30 seconds", () => {
    expect(nextBackoffMs(1)).toBe(30_000);
    expect(nextBackoffMs(2)).toBe(60_000);
    expect(nextBackoffMs(3)).toBe(120_000);
  });

  it("caps at ten minutes so a stuck job never waits an hour", () => {
    expect(nextBackoffMs(10)).toBe(10 * 60_000);
    expect(nextBackoffMs(100)).toBe(10 * 60_000);
  });

  it("tolerates nonsense attempt counts", () => {
    expect(nextBackoffMs(0)).toBe(30_000);
    expect(nextBackoffMs(-5)).toBe(30_000);
  });

  it("keeps the reaper window wider than the longest expected generation", () => {
    // The Chatterbox client times out at 180s by default; a claim must not be
    // declared stale while a legitimate generation could still be running.
    expect(STALE_CLAIM_MINUTES * 60_000).toBeGreaterThan(180_000);
  });

  it("bounds total retry delay to something a user would plausibly wait", () => {
    let total = 0;
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) {
      total += nextBackoffMs(attempt);
    }
    expect(total).toBeLessThanOrEqual(15 * 60_000);
  });
});
