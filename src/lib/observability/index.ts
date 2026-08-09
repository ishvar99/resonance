import * as Sentry from "@sentry/nextjs";

import { isApplicationError } from "@/lib/errors";

/**
 * Thin wrapper over Sentry.
 *
 * Two jobs: keep the rest of the codebase from importing Sentry directly, and
 * make sure nothing secret is attached to an event. Only identifiers
 * (organization, generation, voice) are ever sent — never text prompts, audio,
 * credentials or email addresses.
 */

export type ErrorContext = {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
};

/** Identifier-shaped keys allowed through to Sentry. */
const ALLOWED_EXTRA_KEYS = new Set([
  "organizationId",
  "generationId",
  "voiceId",
  "requestId",
  "meter",
  "status",
  "operation",
  "key",
  "characterCount",
  "provider",
  "reason",
]);

function sanitize(extra: Record<string, unknown> | undefined) {
  if (!extra) return undefined;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(extra)) {
    if (!ALLOWED_EXTRA_KEYS.has(key)) continue;
    if (typeof value === "string" && value.length > 200) continue;
    safe[key] = value;
  }
  return safe;
}

export function captureException(error: unknown, context?: ErrorContext): void {
  const applicationContext = isApplicationError(error) ? error.context : undefined;

  Sentry.captureException(error, {
    tags: {
      ...(isApplicationError(error) ? { errorCode: error.code } : {}),
      ...context?.tags,
    },
    extra: {
      ...sanitize(applicationContext),
      ...sanitize(context?.extra),
    },
  });

  if (process.env.NODE_ENV !== "production") {
    console.error("[resonance]", error);
  }
}

/**
 * Attaches the current workspace to the active scope so every event from this
 * request is grouped by tenant. Organization id is an opaque Clerk identifier,
 * not personal data.
 */
export function setOrganizationScope(organizationId: string, userId?: string): void {
  Sentry.setTag("organizationId", organizationId);
  if (userId) Sentry.setUser({ id: userId });
}

export const startSpan = Sentry.startSpan;
