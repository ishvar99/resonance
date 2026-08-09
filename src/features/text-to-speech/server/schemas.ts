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
  status: z.enum(["PENDING", "COMPLETED", "FAILED"]).optional(),
  search: z.string().trim().max(100).optional(),
});
