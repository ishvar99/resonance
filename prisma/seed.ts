/**
 * Seeds the global system voice library.
 *
 * System voices have `organizationId = null` and `variant = SYSTEM`, which makes
 * them readable by every workspace (see `accessibleVoiceFilter`).
 *
 * Real reference audio is NOT in the repository — the Chatterbox samples are
 * not redistributable. Outside production, seeding finishes by attaching
 * clearly-marked placeholder fixtures (generated tones) to any system voice
 * without a sample, so preview and the audio pipeline work immediately. Attach
 * licensed recordings with `npm run voices:attach -- <dir>`; in production
 * that is the only path, since fixtures are refused there.
 *
 * Run with: npm run db:seed
 */

import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

import { PrismaClient } from "../src/generated/prisma/client";
import type { VoiceCategory } from "../src/generated/prisma/enums";
import {
  attachFixtureSamples,
  createStorageForScripts,
} from "../scripts/voice-sample-lib";

type SystemVoiceSeed = {
  slug: string;
  name: string;
  description: string;
  category: VoiceCategory;
  language: string;
};

const SYSTEM_VOICES: SystemVoiceSeed[] = [
  {
    slug: "aaron",
    name: "Aaron",
    description:
      "Steady American baritone with an unhurried delivery. Built for long-form narration and audiobooks.",
    category: "AUDIOBOOK",
    language: "en-US",
  },
  {
    slug: "andy",
    name: "Andy",
    description:
      "Bright, conversational and quick to smile. Suits product walkthroughs and explainer videos.",
    category: "CONVERSATIONAL",
    language: "en-US",
  },
  {
    slug: "emma",
    name: "Emma",
    description:
      "Warm British contralto with careful diction. A natural fit for documentary narration.",
    category: "NARRATIVE",
    language: "en-GB",
  },
  {
    slug: "sarah",
    name: "Sarah",
    description:
      "Clear, patient and reassuring. Designed for support flows and IVR prompts.",
    category: "CUSTOMER_SERVICE",
    language: "en-US",
  },
  {
    slug: "michael",
    name: "Michael",
    description:
      "Confident corporate read with a measured pace. Good for training material and internal comms.",
    category: "CORPORATE",
    language: "en-US",
  },
  {
    slug: "priya",
    name: "Priya",
    description:
      "Energetic Indian English voice with crisp consonants. Works well for advertising and promos.",
    category: "ADVERTISING",
    language: "hi-IN",
  },
  {
    slug: "lucas",
    name: "Lucas",
    description:
      "Relaxed Brazilian Portuguese voice with an easy rhythm. Suited to podcasts and interviews.",
    category: "PODCAST",
    language: "pt-BR",
  },
  {
    slug: "nova",
    name: "Nova",
    description:
      "Soft, breathy and slow. Written for guided meditation and sleep content.",
    category: "MEDITATION",
    language: "en-US",
  },
];

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  console.info("Seeding system voices…");

  let created = 0;
  let updated = 0;

  for (const voice of SYSTEM_VOICES) {
    // Deterministic ids keep re-seeding idempotent and make it possible to
    // reference `system/voices/{id}/source.wav` before the row exists.
    const id = `system_${voice.slug}`;

    const existing = await prisma.voice.findUnique({ where: { id } });

    await prisma.voice.upsert({
      where: { id },
      create: {
        id,
        organizationId: null,
        variant: "SYSTEM",
        name: voice.name,
        description: voice.description,
        category: voice.category,
        language: voice.language,
      },
      update: {
        name: voice.name,
        description: voice.description,
        category: voice.category,
        language: voice.language,
      },
    });

    if (existing) updated += 1;
    else created += 1;
  }

  console.info(
    `Done — ${created} voice(s) created, ${updated} updated, ${SYSTEM_VOICES.length} total.`,
  );

  if (process.env.NODE_ENV === "production") {
    console.info(
      "Production: no placeholder audio attached. Add licensed recordings with `npm run voices:attach -- <dir>`.",
    );
    return;
  }

  // Development nicety, never a seed failure: rows are the contract, audio is
  // best-effort.
  try {
    const summary = await attachFixtureSamples(prisma, createStorageForScripts());
    console.info(
      summary.attached.length > 0
        ? `Attached placeholder preview audio to ${summary.attached.length} voice(s) — generated tones, clearly not recordings.`
        : "All system voices already have samples; placeholders untouched.",
    );
  } catch (error) {
    console.warn(
      "Could not attach placeholder audio (storage unavailable?). Voices exist; previews stay disabled:",
      error instanceof Error ? error.message : error,
    );
  }
}

main()
  .catch((error) => {
    console.error("Seeding failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
