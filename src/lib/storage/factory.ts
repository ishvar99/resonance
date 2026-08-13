import { LocalStorage } from "@/lib/storage/local";
import { R2Storage } from "@/lib/storage/r2";
import type { ObjectStorage } from "@/lib/storage/types";

/**
 * Pure storage construction, shared by the Next.js runtime (via
 * `@/lib/storage`, which adds the `server-only` guard and caching) and by
 * operational scripts (`scripts/`, `prisma/seed.ts`) that run under tsx where
 * `server-only` would throw and T3 env validation would demand unrelated
 * variables like the Clerk keys.
 *
 * Deliberately takes a plain config object instead of importing
 * `@/lib/environment`: scripts feed it `process.env`, the app feeds it the
 * validated env. The production rule is enforced in both cases.
 */
export type StorageEnvironment = {
  R2_ACCOUNT_ID?: string;
  R2_ENDPOINT?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET_NAME?: string;
  R2_REGION?: string;
  LOCAL_STORAGE_DIR?: string;
};

/** Empty strings in `.env` files mean "unset". */
const value = (raw: string | undefined): string | undefined =>
  raw?.trim() ? raw.trim() : undefined;

export function createStorageFromEnv(
  source: StorageEnvironment,
  options: { production: boolean; quiet?: boolean },
): ObjectStorage {
  const endpoint =
    value(source.R2_ENDPOINT) ??
    (value(source.R2_ACCOUNT_ID)
      ? `https://${value(source.R2_ACCOUNT_ID)}.r2.cloudflarestorage.com`
      : undefined);

  const accessKeyId = value(source.R2_ACCESS_KEY_ID);
  const secretAccessKey = value(source.R2_SECRET_ACCESS_KEY);
  const bucket = value(source.R2_BUCKET_NAME);

  if (endpoint && accessKeyId && secretAccessKey && bucket) {
    return new R2Storage({
      bucket,
      region: value(source.R2_REGION) ?? "auto",
      endpoint,
      accessKeyId,
      secretAccessKey,
    });
  }

  if (options.production) {
    // Production must never quietly write to a local disk.
    throw new Error(
      "Object storage is not configured. Set R2_ACCOUNT_ID (or R2_ENDPOINT), R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME.",
    );
  }

  const localDirectory = value(source.LOCAL_STORAGE_DIR) ?? ".resonance/storage";
  if (!options.quiet) {
    console.warn(
      "[resonance] R2 is not configured — using the local development storage adapter at %s",
      localDirectory,
    );
  }
  return new LocalStorage(localDirectory);
}
