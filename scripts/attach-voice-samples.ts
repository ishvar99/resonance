/**
 * Attach reference samples to system voices.
 *
 *   npm run voices:fixtures                # dev placeholders for voices missing samples
 *   npm run voices:fixtures -- --force     # regenerate placeholders for ALL system voices
 *   npm run voices:attach -- ./samples     # real recordings: aaron.wav → system_aaron
 *
 * Storage target follows the environment: R2 when configured, the local
 * development directory otherwise. Placeholders are refused in production
 * without --allow-production.
 */

import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  attachFixtureSamples,
  attachSamplesFromDirectory,
  createStorageForScripts,
} from "./voice-sample-lib";

async function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const positional = args.filter((a) => !a.startsWith("--"));

  const useFixtures = flags.has("--fixtures");
  const directory = positional[0];

  if (useFixtures === Boolean(directory)) {
    console.error(
      "Usage:\n" +
        "  tsx scripts/attach-voice-samples.ts --fixtures [--force] [--allow-production]\n" +
        "  tsx scripts/attach-voice-samples.ts <directory-of-audio-files>",
    );
    process.exitCode = 1;
    return;
  }

  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const storage = createStorageForScripts();

  try {
    const summary = useFixtures
      ? await attachFixtureSamples(db, storage, {
          force: flags.has("--force"),
          allowProduction: flags.has("--allow-production"),
        })
      : await attachSamplesFromDirectory(db, storage, directory!);

    for (const line of summary.attached) console.info(`  ✔ ${line}`);
    for (const line of summary.skipped) console.warn(`  – ${line}`);
    console.info(
      `Done — ${summary.attached.length} sample(s) attached, ${summary.skipped.length} skipped.`,
    );
    if (useFixtures && summary.attached.length === 0) {
      console.info(
        "All system voices already have samples. Use --force to regenerate placeholders.",
      );
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error("Failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
