import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Strongly-typed environment configuration.
 *
 * Rules encoded here:
 *  - Secrets never appear under `client` — anything in `client` is inlined into
 *    the browser bundle at build time.
 *  - Integrations that ship a development adapter (storage, speech, billing) are
 *    optional in development but REQUIRED in production. `superRefine` below
 *    fails the process at boot rather than silently degrading a production
 *    deployment to mock behaviour.
 */

const nodeEnvironment = z
  .enum(["development", "test", "production"])
  .default("development");

/** Empty strings in `.env` files are treated as "unset". */
const optionalString = z
  .string()
  .trim()
  .min(1)
  .optional()
  .or(z.literal("").transform(() => undefined));

export const env = createEnv({
  server: {
    NODE_ENV: nodeEnvironment,

    DATABASE_URL: z.string().url(),

    CLERK_SECRET_KEY: z.string().min(1),

    // --- Chatterbox (self-hosted GPU inference service) ---------------------
    CHATTERBOX_API_URL: optionalString.pipe(z.string().url().optional()),
    CHATTERBOX_API_KEY: optionalString,
    CHATTERBOX_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),
    /**
     * Texts at or under this length generate synchronously in the request;
     * longer ones are queued for the worker (`npm run worker`). The default
     * keeps everything inline, so deployments without a worker lose nothing —
     * lower it only once a worker process is actually running.
     */
    GENERATION_INLINE_MAX_CHARS: z.coerce.number().int().positive().default(5_000),

    // --- Cloudflare R2 / S3-compatible object storage -----------------------
    R2_ACCOUNT_ID: optionalString,
    R2_ACCESS_KEY_ID: optionalString,
    R2_SECRET_ACCESS_KEY: optionalString,
    R2_BUCKET_NAME: optionalString,
    R2_REGION: z.string().default("auto"),
    /** Explicit endpoint. Overrides the R2 endpoint derived from R2_ACCOUNT_ID (MinIO, AWS S3, …). */
    R2_ENDPOINT: optionalString.pipe(z.string().url().optional()),
    /** Only set this if the bucket is genuinely public. Audio is served through /api/audio by default. */
    R2_PUBLIC_URL: optionalString.pipe(z.string().url().optional()),
    /** Directory used by the development storage adapter when R2 is unconfigured. */
    LOCAL_STORAGE_DIR: z.string().default(".resonance/storage"),

    // --- Polar (usage-based billing) ---------------------------------------
    POLAR_ACCESS_TOKEN: optionalString,
    POLAR_WEBHOOK_SECRET: optionalString,
    POLAR_SERVER: z.enum(["production", "sandbox"]).default("sandbox"),
    /** Polar product id customers are sent to when they lack entitlement. */
    POLAR_PRODUCT_ID: optionalString,

    // --- Sentry -------------------------------------------------------------
    SENTRY_AUTH_TOKEN: optionalString,
    SENTRY_ORG: optionalString,
    SENTRY_PROJECT: optionalString,

    /** Base URL used to build absolute redirect targets (checkout return, webhooks). */
    APP_URL: z
      .string()
      .url()
      .default("http://localhost:3000"),
  },

  client: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_SENTRY_DSN: optionalString.pipe(z.string().url().optional()),
    NEXT_PUBLIC_APP_NAME: z.string().default("Resonance"),
  },

  /**
   * Next.js does not expand `process.env` on the client, so every client value
   * has to be referenced literally.
   */
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,

    CHATTERBOX_API_URL: process.env.CHATTERBOX_API_URL,
    CHATTERBOX_API_KEY: process.env.CHATTERBOX_API_KEY,
    CHATTERBOX_TIMEOUT_MS: process.env.CHATTERBOX_TIMEOUT_MS,
    GENERATION_INLINE_MAX_CHARS: process.env.GENERATION_INLINE_MAX_CHARS,

    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
    R2_REGION: process.env.R2_REGION,
    R2_ENDPOINT: process.env.R2_ENDPOINT,
    R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
    LOCAL_STORAGE_DIR: process.env.LOCAL_STORAGE_DIR,

    POLAR_ACCESS_TOKEN: process.env.POLAR_ACCESS_TOKEN,
    POLAR_WEBHOOK_SECRET: process.env.POLAR_WEBHOOK_SECRET,
    POLAR_SERVER: process.env.POLAR_SERVER,
    POLAR_PRODUCT_ID: process.env.POLAR_PRODUCT_ID,

    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    SENTRY_ORG: process.env.SENTRY_ORG,
    SENTRY_PROJECT: process.env.SENTRY_PROJECT,

    APP_URL: process.env.APP_URL,

    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  },

  /**
   * `next build` runs with a partial environment in CI. Set SKIP_ENV_VALIDATION=1
   * there; runtime code still validates on first import in the server process.
   */
  skipValidation: process.env.SKIP_ENV_VALIDATION === "1",
  emptyStringAsUndefined: true,

  onValidationError: (issues) => {
    console.error("❌ Invalid environment variables:", issues);
    throw new Error("Invalid environment variables");
  },
});

/**
 * Production must never silently fall back to a development adapter.
 * Called once from `src/instrumentation.ts` so a misconfigured deploy crashes
 * at boot instead of at the first user request.
 */
export function assertProductionIntegrations(): void {
  if (env.NODE_ENV !== "production") return;

  const missing: string[] = [];

  if (!env.CHATTERBOX_API_URL) missing.push("CHATTERBOX_API_URL");
  if (!env.CHATTERBOX_API_KEY) missing.push("CHATTERBOX_API_KEY");
  if (!env.R2_ACCESS_KEY_ID) missing.push("R2_ACCESS_KEY_ID");
  if (!env.R2_SECRET_ACCESS_KEY) missing.push("R2_SECRET_ACCESS_KEY");
  if (!env.R2_BUCKET_NAME) missing.push("R2_BUCKET_NAME");
  if (!env.R2_ACCOUNT_ID && !env.R2_ENDPOINT) {
    missing.push("R2_ACCOUNT_ID (or R2_ENDPOINT)");
  }
  if (!env.POLAR_ACCESS_TOKEN) missing.push("POLAR_ACCESS_TOKEN");

  if (missing.length > 0) {
    throw new Error(
      `Resonance is running in production but these integrations are unconfigured: ${missing.join(
        ", ",
      )}. Development adapters are disabled in production — configure the real services or deploy with NODE_ENV=development.`,
    );
  }
}

export const isProduction = () => env.NODE_ENV === "production";
export const isDevelopmentLike = () => env.NODE_ENV !== "production";
