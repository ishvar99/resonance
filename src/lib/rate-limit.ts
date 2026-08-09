import "server-only";

import { RateLimitError } from "@/lib/errors";

/**
 * In-process sliding-window rate limiter.
 *
 * Scope: this protects a single server instance from a runaway client — it is
 * not a distributed limiter. Behind more than one replica, swap the `hits` map
 * for Redis/Upstash; the call sites do not change.
 */

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

/** Bounds memory if a lot of distinct keys pass through. */
const MAX_TRACKED_KEYS = 10_000;

export type RateLimitRule = {
  /** Requests allowed per window. */
  limit: number;
  windowMs: number;
};

export const RATE_LIMITS = {
  /** GPU inference is the expensive one. */
  generateSpeech: { limit: 20, windowMs: 60_000 },
  createVoice: { limit: 10, windowMs: 60_000 },
  audioStream: { limit: 240, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;

export function consumeRateLimit(
  key: string,
  rule: RateLimitRule,
  now = Date.now(),
): void {
  if (windows.size > MAX_TRACKED_KEYS) {
    for (const [existingKey, window] of windows) {
      if (window.resetAt <= now) windows.delete(existingKey);
    }
  }

  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + rule.windowMs });
    return;
  }

  if (existing.count >= rule.limit) {
    throw new RateLimitError(Math.ceil((existing.resetAt - now) / 1000));
  }

  existing.count += 1;
}

/** Test helper — never called from application code. */
export function resetRateLimits(): void {
  windows.clear();
}
