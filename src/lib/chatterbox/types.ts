/**
 * Speech generation contract.
 *
 * The only production implementation is `ChatterboxSpeechGenerator`, which
 * talks to the self-hosted Chatterbox GPU service in `chatterbox/`. The mock
 * implementation exists so the product is runnable without a GPU.
 *
 * Parameter names and ranges mirror `ChatterboxTurboTTS.generate()`:
 *   generate(text, repetition_penalty=1.2, min_p=0.0, top_p=0.95,
 *            audio_prompt_path=None, exaggeration=0.0, cfg_weight=0.0,
 *            temperature=0.8, top_k=1000, norm_loudness=True)
 */

export type SpeechGenerationInput = {
  text: string;

  /**
   * Object key of the reference sample that conditions the voice.
   * `null` uses the model's built-in default voice.
   */
  voiceKey: string | null;

  /**
   * Short-lived signed URL for `voiceKey`. Sent so the GPU service can fetch the
   * reference sample without holding bucket credentials.
   */
  voiceUrl?: string | null;

  temperature: number;
  topP: number;
  topK: number;
  repetitionPenalty: number;
  /** Output gain applied after loudness normalisation. 1.0 = unchanged. */
  loudness?: number;

  /** Correlation id echoed in the service logs. Never contains user content. */
  requestId?: string;
};

export type GeneratedAudio = {
  audio: Uint8Array;
  contentType: string;
  sampleRate: number | null;
  durationSeconds: number | null;
  /** Which adapter produced this audio — surfaced in the UI for mock output. */
  provider: "chatterbox" | "mock";
};

export interface SpeechGenerator {
  readonly kind: "chatterbox" | "mock";
  generate(input: SpeechGenerationInput): Promise<GeneratedAudio>;
  healthCheck(): Promise<{ healthy: boolean; detail?: string }>;
}

/**
 * UI-facing bounds for the four exposed parameters. Shared by the Zod schema,
 * the sliders and the tests so they can never drift apart.
 */
export const GENERATION_PARAMETERS = {
  temperature: {
    label: "Creativity",
    min: 0,
    max: 2,
    step: 0.05,
    default: 0.8,
    lowLabel: "Consistent",
    highLabel: "Expressive",
    description: "How much the model varies its delivery between takes.",
  },
  topP: {
    label: "Voice Variety",
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.95,
    lowLabel: "Stable",
    highLabel: "Dynamic",
    description: "Narrows or widens the pool of tokens sampled at each step.",
  },
  topK: {
    label: "Expression Range",
    min: 1,
    max: 2000,
    step: 1,
    default: 1000,
    lowLabel: "Subtle",
    highLabel: "Dramatic",
    description: "How many candidate speech tokens stay in play.",
  },
  repetitionPenalty: {
    label: "Natural Flow",
    min: 1,
    max: 2,
    step: 0.05,
    default: 1.2,
    lowLabel: "Repetitive",
    highLabel: "Natural",
    description: "Discourages the model from looping on the same sounds.",
  },
} as const;

export type GenerationParameterKey = keyof typeof GENERATION_PARAMETERS;

export const DEFAULT_GENERATION_SETTINGS = {
  temperature: GENERATION_PARAMETERS.temperature.default,
  topP: GENERATION_PARAMETERS.topP.default,
  topK: GENERATION_PARAMETERS.topK.default,
  repetitionPenalty: GENERATION_PARAMETERS.repetitionPenalty.default,
};

/** Hard ceiling on a single request, enforced on the client and the server. */
export const MAX_GENERATION_CHARACTERS = 5_000;
