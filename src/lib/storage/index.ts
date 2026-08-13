import "server-only";

import { env, isProduction } from "@/lib/environment";
import { createStorageFromEnv } from "@/lib/storage/factory";
import type { ObjectStorage } from "@/lib/storage/types";

export type { ByteRange, ObjectStorage, StoredObject } from "@/lib/storage/types";
export * from "@/lib/storage/keys";

const globalForStorage = globalThis as unknown as {
  resonanceStorage?: ObjectStorage;
};

/**
 * Lazily-constructed storage adapter for application code.
 *
 * Construction is deferred to first use rather than module evaluation. `next
 * build` imports every route module to collect page data, and an eager
 * singleton would make the production guard fail the *build* on a machine
 * without credentials — instead of failing the first request on a misconfigured
 * *deployment*, which is what it is for.
 *
 * The instance is cached on `globalThis` so Next's dev-time module reloading
 * does not leak a new S3 client on every edit. Scripts must not import this
 * module (it is `server-only` and pulls full env validation); they use
 * `createStorageFromEnv` from `./factory` directly.
 */
export function getStorage(): ObjectStorage {
  globalForStorage.resonanceStorage ??= createStorageFromEnv(
    {
      R2_ACCOUNT_ID: env.R2_ACCOUNT_ID,
      R2_ENDPOINT: env.R2_ENDPOINT,
      R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
      R2_BUCKET_NAME: env.R2_BUCKET_NAME,
      R2_REGION: env.R2_REGION,
      LOCAL_STORAGE_DIR: env.LOCAL_STORAGE_DIR,
    },
    { production: isProduction() },
  );
  return globalForStorage.resonanceStorage;
}
