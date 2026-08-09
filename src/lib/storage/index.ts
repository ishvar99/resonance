import "server-only";

import { env, isProduction } from "@/lib/environment";
import { LocalStorage } from "@/lib/storage/local";
import { R2Storage } from "@/lib/storage/r2";
import type { ObjectStorage } from "@/lib/storage/types";

export type { ByteRange, ObjectStorage, StoredObject } from "@/lib/storage/types";
export * from "@/lib/storage/keys";

function r2EndpointFromConfig(): string | null {
  if (env.R2_ENDPOINT) return env.R2_ENDPOINT;
  if (env.R2_ACCOUNT_ID) {
    return `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  }
  return null;
}

function createStorage(): ObjectStorage {
  const endpoint = r2EndpointFromConfig();

  const configured =
    Boolean(endpoint) &&
    Boolean(env.R2_ACCESS_KEY_ID) &&
    Boolean(env.R2_SECRET_ACCESS_KEY) &&
    Boolean(env.R2_BUCKET_NAME);

  if (configured) {
    return new R2Storage({
      bucket: env.R2_BUCKET_NAME!,
      region: env.R2_REGION,
      endpoint: endpoint!,
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    });
  }

  if (isProduction()) {
    // Belt and braces — `assertProductionIntegrations()` should have caught
    // this at boot, but production must never write to the local disk.
    throw new Error(
      "Object storage is not configured. Set R2_ACCOUNT_ID (or R2_ENDPOINT), R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME.",
    );
  }

  console.warn(
    "[resonance] R2 is not configured — using the local development storage adapter at %s",
    env.LOCAL_STORAGE_DIR,
  );
  return new LocalStorage(env.LOCAL_STORAGE_DIR);
}

const globalForStorage = globalThis as unknown as {
  resonanceStorage?: ObjectStorage;
};

/**
 * Lazily-constructed storage adapter.
 *
 * Construction is deferred to first use rather than module evaluation. `next
 * build` imports every route module to collect page data, and an eager
 * singleton would make the production guard above fail the *build* on a machine
 * without credentials — instead of failing the first request on a misconfigured
 * *deployment*, which is what it is for.
 *
 * The instance is cached on `globalThis` so Next's dev-time module reloading
 * does not leak a new S3 client on every edit.
 */
export function getStorage(): ObjectStorage {
  globalForStorage.resonanceStorage ??= createStorage();
  return globalForStorage.resonanceStorage;
}
