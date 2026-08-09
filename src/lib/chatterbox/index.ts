import "server-only";

import { ChatterboxSpeechGenerator } from "@/lib/chatterbox/client";
import { MockSpeechGenerator } from "@/lib/chatterbox/mock";
import type { SpeechGenerator } from "@/lib/chatterbox/types";
import { env, isProduction } from "@/lib/environment";

export type {
  GeneratedAudio,
  SpeechGenerationInput,
  SpeechGenerator,
} from "@/lib/chatterbox/types";
export {
  DEFAULT_GENERATION_SETTINGS,
  GENERATION_PARAMETERS,
  MAX_GENERATION_CHARACTERS,
} from "@/lib/chatterbox/types";

function createSpeechGenerator(): SpeechGenerator {
  if (env.CHATTERBOX_API_URL && env.CHATTERBOX_API_KEY) {
    return new ChatterboxSpeechGenerator({
      baseUrl: env.CHATTERBOX_API_URL,
      apiKey: env.CHATTERBOX_API_KEY,
      timeoutMs: env.CHATTERBOX_TIMEOUT_MS,
    });
  }

  if (isProduction()) {
    throw new Error(
      "Chatterbox is not configured. Set CHATTERBOX_API_URL and CHATTERBOX_API_KEY — the development generator is disabled in production.",
    );
  }

  console.warn(
    "[resonance] Chatterbox is not configured — generations will return development preview audio.",
  );
  return new MockSpeechGenerator();
}

const globalForSpeech = globalThis as unknown as {
  resonanceSpeechGenerator?: SpeechGenerator;
};

/** Lazily constructed — see the note on `getStorage()` for why. */
export function getSpeechGenerator(): SpeechGenerator {
  globalForSpeech.resonanceSpeechGenerator ??= createSpeechGenerator();
  return globalForSpeech.resonanceSpeechGenerator;
}
