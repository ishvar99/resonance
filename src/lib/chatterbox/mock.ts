import { encodeWav } from "@/lib/audio/wav";
import type {
  GeneratedAudio,
  SpeechGenerationInput,
  SpeechGenerator,
} from "@/lib/chatterbox/types";

const SAMPLE_RATE = 24_000;
/** Roughly conversational pace, used to size the placeholder clip. */
const CHARACTERS_PER_SECOND = 15;

/**
 * Development-only speech generator.
 *
 * It does NOT synthesise speech. It renders a short, deterministic tonal
 * phrase so that the whole pipeline — storage, the range-request audio proxy,
 * the waveform player, downloads — is exercised without a GPU. Output is
 * deterministic for a given input so tests can assert on it.
 *
 * Anything produced here is labelled as a development preview in the UI.
 */
export class MockSpeechGenerator implements SpeechGenerator {
  readonly kind = "mock" as const;

  async generate(input: SpeechGenerationInput): Promise<GeneratedAudio> {
    const durationSeconds = clamp(
      input.text.length / CHARACTERS_PER_SECOND,
      1.5,
      30,
    );
    const totalSamples = Math.floor(durationSeconds * SAMPLE_RATE);
    const samples = new Float32Array(totalSamples);

    const seed = hash(`${input.text}|${input.voiceKey ?? "default"}`);
    // Pentatonic steps keep the placeholder pleasant rather than alarming.
    const scale = [0, 2, 4, 7, 9, 12];
    const baseFrequency = 174 + (seed % 7) * 12;

    // `temperature` widens the pitch wander and `topP` the vibrato, so moving
    // the sliders produces audibly different output even in development.
    const wander = 1 + clamp(input.temperature, 0, 2) * 0.06;
    const vibratoDepth = clamp(input.topP, 0, 1) * 4;

    const syllableCount = Math.max(2, Math.round(durationSeconds * 3.2));
    const samplesPerSyllable = Math.floor(totalSamples / syllableCount);

    for (let syllable = 0; syllable < syllableCount; syllable += 1) {
      const step = scale[(seed + syllable * 3) % scale.length]!;
      const frequency =
        baseFrequency * Math.pow(2, step / 12) * (syllable % 4 === 3 ? wander : 1);

      const start = syllable * samplesPerSyllable;
      const end = Math.min(start + samplesPerSyllable, totalSamples);
      const length = end - start;
      if (length <= 0) continue;

      for (let index = 0; index < length; index += 1) {
        const t = index / SAMPLE_RATE;
        const progress = index / length;

        // Percussive envelope with a short fade so syllables do not click.
        const attack = Math.min(1, progress / 0.08);
        const release = Math.min(1, (1 - progress) / 0.35);
        const envelope = attack * release * 0.32;

        const vibrato = Math.sin(2 * Math.PI * 5.5 * t) * vibratoDepth;
        const phase = 2 * Math.PI * (frequency + vibrato) * t;

        // Two harmonics give it a little body without sounding like a siren.
        samples[start + index] =
          envelope * (Math.sin(phase) * 0.7 + Math.sin(phase * 2) * 0.3);
      }
    }

    const gain = clamp(input.loudness ?? 1, 0.1, 2);
    if (gain !== 1) {
      for (let index = 0; index < samples.length; index += 1) {
        samples[index] = clamp(samples[index]! * gain, -1, 1);
      }
    }

    return {
      audio: encodeWav(samples, SAMPLE_RATE),
      contentType: "audio/wav",
      sampleRate: SAMPLE_RATE,
      durationSeconds,
      provider: "mock",
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; detail?: string }> {
    return { healthy: true, detail: "Development adapter — no GPU service configured" };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hash(value: string): number {
  let result = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16_777_619);
  }
  return Math.abs(result);
}
