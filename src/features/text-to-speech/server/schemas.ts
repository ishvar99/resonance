import { z } from "zod";

import {
  GENERATION_PARAMETERS,
  MAX_GENERATION_CHARACTERS,
} from "@/lib/chatterbox/types";

/**
 * Generation input validation.
 *
 * Bounds come from `GENERATION_PARAMETERS`, the same object the sliders render
 * from, so a UI change can never let an out-of-range value reach the GPU.
 */

const parameter = (key: keyof typeof GENERATION_PARAMETERS) => {
  const spec = GENERATION_PARAMETERS[key];
  return z
    .number()
    .min(spec.min, `${spec.label} must be at least ${spec.min}.`)
    .max(spec.max, `${spec.label} must be at most ${spec.max}.`);
};

export const generationSettingsSchema = z.object({
  temperature: parameter("temperature").default(
    GENERATION_PARAMETERS.temperature.default,
  ),
  topP: parameter("topP").default(GENERATION_PARAMETERS.topP.default),
  topK: parameter("topK").int().default(GENERATION_PARAMETERS.topK.default),
  repetitionPenalty: parameter("repetitionPenalty").default(
    GENERATION_PARAMETERS.repetitionPenalty.default,
  ),
});

export type GenerationSettings = z.infer<typeof generationSettingsSchema>;

export const generateSpeechSchema = generationSettingsSchema.extend({
  text: z
    .string()
    .trim()
    .min(1, "Enter some text to bring to life.")
    .max(
      MAX_GENERATION_CHARACTERS,
      `Keep it under ${MAX_GENERATION_CHARACTERS.toLocaleString()} characters — split longer scripts into passages.`,
    ),
  voiceId: z.string().min(1, "Choose a voice."),
});

export type GenerateSpeechInput = z.input<typeof generateSpeechSchema>;

export const historyQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  status: z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED"]).optional(),
  search: z.string().trim().max(100).optional(),
});

/**
 * Public REST API contract (/api/v1/text-to-speech).
 *
 * snake_case on the wire — the convention of every major model API — mapped
 * here onto the same internal shape and the same bounds as the dashboard.
 * Unknown fields are stripped, so a smuggled `organization_id` never survives
 * parsing; tenant identity comes exclusively from the API key.
 */
export const publicGenerateSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, "`text` must not be empty.")
      .max(
        MAX_GENERATION_CHARACTERS,
        `\`text\` is limited to ${MAX_GENERATION_CHARACTERS} characters per request.`,
      ),
    voice_id: z.string().min(1, "`voice_id` is required."),
    temperature: parameter("temperature").default(
      GENERATION_PARAMETERS.temperature.default,
    ),
    top_p: parameter("topP").default(GENERATION_PARAMETERS.topP.default),
    top_k: parameter("topK").int().default(GENERATION_PARAMETERS.topK.default),
    repetition_penalty: parameter("repetitionPenalty").default(
      GENERATION_PARAMETERS.repetitionPenalty.default,
    ),
  })
  .transform((value) => ({
    text: value.text,
    voiceId: value.voice_id,
    temperature: value.temperature,
    topP: value.top_p,
    topK: value.top_k,
    repetitionPenalty: value.repetition_penalty,
  }));

export type PublicGenerateInput = z.output<typeof publicGenerateSchema>;
