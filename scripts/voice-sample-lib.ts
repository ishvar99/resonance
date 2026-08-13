/**
 * Attaching reference samples to system voices.
 *
 * Two modes, one shared core:
 *
 *  - FIXTURES (development): deterministic placeholder WAVs rendered by the
 *    same tone generator the development speech adapter uses. They make voice
 *    preview and the whole audio pipeline work with zero external assets, and
 *    they are unmistakably placeholders — spoken-word audio they are not.
 *
 *  - REAL SAMPLES (production): WAV/MP3/…files from a local directory, matched
 *    to system voices by filename (aaron.wav → system_aaron), uploaded and
 *    linked. This is how properly licensed recordings get attached.
 *
 * Runs under tsx, outside Next.js — hence relative imports, no `server-only`,
 * and storage built from process.env via the shared factory rather than the
 * validated app environment (which would demand Clerk keys just to seed).
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { MockSpeechGenerator } from "../src/lib/chatterbox/mock";
import { createStorageFromEnv } from "../src/lib/storage/factory";
import { systemVoiceSourceKey } from "../src/lib/storage/keys";
import type { ObjectStorage } from "../src/lib/storage/types";
import type { PrismaClient } from "../src/generated/prisma/client";

export function createStorageForScripts(): ObjectStorage {
  return createStorageFromEnv(
    {
      R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
      R2_ENDPOINT: process.env.R2_ENDPOINT,
      R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
      R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
      R2_REGION: process.env.R2_REGION,
      LOCAL_STORAGE_DIR: process.env.LOCAL_STORAGE_DIR,
    },
    { production: process.env.NODE_ENV === "production" },
  );
}

/* ------------------------------------------------------------------------- *
 * Fixtures
 * ------------------------------------------------------------------------- */

const fixtureGenerator = new MockSpeechGenerator();

/**
 * Scripted so each voice gets audio of a distinct length and (via the
 * voice-id seed) a distinct melody — flipping through previews in the UI
 * should not play the same clip five times.
 */
function fixtureScript(voiceName: string): string {
  return (
    `${voiceName} here. This is a development placeholder for the ${voiceName} ` +
    `system voice — a generated tone, not a recording. Attach a real sample ` +
    `before conditioning a production voice model on it.`
  );
}

export async function renderFixtureWav(voice: {
  id: string;
  name: string;
}): Promise<Uint8Array> {
  const { audio } = await fixtureGenerator.generate({
    text: fixtureScript(voice.name),
    voiceKey: voice.id, // seeds the melody, so every voice sounds different
    temperature: 0.8,
    topP: 0.95,
    topK: 1000,
    repetitionPenalty: 1.2,
  });
  return audio;
}

export type AttachSummary = {
  attached: string[];
  skipped: string[];
};

/**
 * Fills in placeholder samples for system voices that have none.
 *
 * Refuses in production unless explicitly overridden: a tone posing as a voice
 * preview is exactly the kind of thing that must not reach paying customers by
 * accident. `force` regenerates fixtures for every system voice, including
 * ones that already have a sample — useful after changing the tone generator,
 * dangerous if real recordings are already attached, hence separate flags.
 */
export async function attachFixtureSamples(
  db: PrismaClient,
  storage: ObjectStorage,
  options: { force?: boolean; allowProduction?: boolean } = {},
): Promise<AttachSummary> {
  if (process.env.NODE_ENV === "production" && !options.allowProduction) {
    throw new Error(
      "Refusing to attach placeholder fixtures in production. Pass --allow-production if this deployment genuinely wants tone placeholders.",
    );
  }

  const voices = await db.voice.findMany({
    where: {
      variant: "SYSTEM",
      ...(options.force ? {} : { r2ObjectKey: null }),
    },
    orderBy: { id: "asc" },
  });

  const summary: AttachSummary = { attached: [], skipped: [] };

  for (const voice of voices) {
    const key = systemVoiceSourceKey(voice.id, "wav");
    const wav = await renderFixtureWav(voice);

    await storage.put({
      key,
      body: wav,
      contentType: "audio/wav",
      // Visible in any bucket browser, so nobody mistakes these for recordings.
      metadata: { fixture: "true", voiceId: voice.id },
    });

    await db.voice.update({
      where: { id: voice.id },
      data: { r2ObjectKey: key },
    });

    summary.attached.push(voice.id);
  }

  return summary;
}

/* ------------------------------------------------------------------------- *
 * Real samples from a directory
 * ------------------------------------------------------------------------- */

export const SAMPLE_CONTENT_TYPES: Record<string, string> = {
  wav: "audio/wav",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  flac: "audio/flac",
  ogg: "audio/ogg",
  webm: "audio/webm",
};

export type MatchedSampleFile = {
  /** Filename without extension — matched against voice ids. */
  stem: string;
  extension: string;
  contentType: string;
};

/**
 * `aaron.wav` → { stem: "aaron", extension: "wav" }. Returns null for hidden
 * files, files without a supported audio extension, and empty stems — callers
 * report those as skipped rather than erroring the whole run.
 */
export function matchSampleFile(filename: string): MatchedSampleFile | null {
  if (filename.startsWith(".")) return null;

  const extension = path.extname(filename).slice(1).toLowerCase();
  const contentType = SAMPLE_CONTENT_TYPES[extension];
  if (!contentType) return null;

  const stem = path.basename(filename, path.extname(filename)).trim();
  if (!stem) return null;

  return { stem, extension, contentType };
}

/**
 * Filename stems accept either the full voice id ("system_aaron") or the bare
 * slug ("aaron"); the seed's ids are `system_<slug>` so both are natural.
 */
export function candidateVoiceIds(stem: string): string[] {
  const normalized = stem.toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
  return normalized.startsWith("system_")
    ? [normalized]
    : [`system_${normalized}`, normalized];
}

/**
 * Attaches real recordings to system voices. Overwrites existing samples for
 * matched voices — replacing a fixture (or an old take) is the entire point.
 * Only SYSTEM voices are eligible; custom voices belong to workspaces and are
 * managed in the product, not from an operator's shell.
 */
export async function attachSamplesFromDirectory(
  db: PrismaClient,
  storage: ObjectStorage,
  directory: string,
): Promise<AttachSummary> {
  const entries = await readdir(directory, { withFileTypes: true });
  const summary: AttachSummary = { attached: [], skipped: [] };

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const matched = matchSampleFile(entry.name);
    if (!matched) {
      summary.skipped.push(`${entry.name} (not a supported audio file)`);
      continue;
    }

    const voice = await db.voice.findFirst({
      where: { id: { in: candidateVoiceIds(matched.stem) }, variant: "SYSTEM" },
    });
    if (!voice) {
      summary.skipped.push(`${entry.name} (no system voice matches "${matched.stem}")`);
      continue;
    }

    const body = await readFile(path.join(directory, entry.name));
    const key = systemVoiceSourceKey(voice.id, matched.extension);

    await storage.put({
      key,
      body: new Uint8Array(body),
      contentType: matched.contentType,
      metadata: { voiceId: voice.id },
    });

    await db.voice.update({ where: { id: voice.id }, data: { r2ObjectKey: key } });
    summary.attached.push(`${voice.id} ← ${entry.name}`);
  }

  return summary;
}
