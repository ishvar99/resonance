import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { database } from "@/lib/database";
import { UnauthorizedError } from "@/lib/errors";
import { captureException } from "@/lib/observability";

/**
 * API key authentication for the public REST API (/api/v1).
 *
 * Secrets look like `rsn_<64 hex>` and exist in plaintext exactly once — in the
 * HTTP response that creates them. The database stores only a SHA-256 digest,
 * so neither a database leak nor a log line yields a usable credential. Lookup
 * is by unique digest, which also sidesteps string-comparison timing leaks.
 */

const KEY_PREFIX = "rsn_";
const SECRET_BYTES = 32;
/** Characters of the secret shown in the UI to identify a key. */
const DISPLAY_PREFIX_LENGTH = 12;

/** How stale `lastUsedAt` may get before we bother writing it again. */
const LAST_USED_WRITE_INTERVAL_MS = 60_000;

export type GeneratedApiKey = {
  /** The full secret. Shown once, never stored. */
  secret: string;
  keyHash: string;
  prefix: string;
  last4: string;
};

export function generateApiKeySecret(): GeneratedApiKey {
  const secret = KEY_PREFIX + randomBytes(SECRET_BYTES).toString("hex");
  return {
    secret,
    keyHash: hashApiKeySecret(secret),
    prefix: secret.slice(0, DISPLAY_PREFIX_LENGTH),
    last4: secret.slice(-4),
  };
}

export function hashApiKeySecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/**
 * Pulls a candidate secret out of a request. Accepts the conventional
 * `Authorization: Bearer <key>` and the simpler `X-API-Key: <key>`.
 * Returns null rather than throwing so the caller controls the error shape.
 */
export function parseApiKeyFromHeaders(headers: Headers): string | null {
  const authorization = headers.get("authorization");
  if (authorization) {
    const [scheme, ...rest] = authorization.trim().split(/\s+/);
    const token = rest.join(" ");
    if (scheme?.toLowerCase() === "bearer" && token.startsWith(KEY_PREFIX)) {
      return token;
    }
  }

  const headerKey = headers.get("x-api-key")?.trim();
  if (headerKey?.startsWith(KEY_PREFIX)) return headerKey;

  return null;
}

export type ApiKeyPrincipal = {
  organizationId: string;
  apiKeyId: string;
};

/**
 * Authenticates a public-API request.
 *
 * The error message never distinguishes "unknown key" from "revoked key" —
 * both are simply invalid to the caller, so revocation state cannot be probed.
 */
export async function authenticateApiKey(request: Request): Promise<ApiKeyPrincipal> {
  const secret = parseApiKeyFromHeaders(request.headers);
  if (!secret) {
    throw new UnauthorizedError(
      "Provide an API key via 'Authorization: Bearer <key>'.",
    );
  }

  const key = await database.apiKey.findUnique({
    where: { keyHash: hashApiKeySecret(secret) },
  });

  if (!key || key.revokedAt !== null) {
    throw new UnauthorizedError("Invalid API key.");
  }

  // Best-effort freshness for the "last used" column in the UI. Throttled so a
  // busy key does not turn every generation into an extra write, and never
  // allowed to fail the request itself.
  const now = Date.now();
  const stale =
    !key.lastUsedAt ||
    now - key.lastUsedAt.getTime() > LAST_USED_WRITE_INTERVAL_MS;

  if (stale) {
    database.apiKey
      .update({ where: { id: key.id }, data: { lastUsedAt: new Date(now) } })
      .catch((cause) => {
        captureException(cause, {
          tags: { area: "public-api", operation: "touch-key" },
        });
      });
  }

  return { organizationId: key.organizationId, apiKeyId: key.id };
}
