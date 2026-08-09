import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/environment";

/**
 * Prisma singleton.
 *
 * Next.js hot-reloads server modules in development, which would otherwise
 * construct a new PrismaClient (and a new pg pool) on every edit until the
 * database refuses connections. Caching on `globalThis` survives HMR.
 */
const createPrismaClient = () =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
    log:
      env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

type PrismaSingleton = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as {
  resonancePrisma?: PrismaSingleton;
};

export const database: PrismaSingleton =
  globalForPrisma.resonancePrisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.resonancePrisma = database;
}
