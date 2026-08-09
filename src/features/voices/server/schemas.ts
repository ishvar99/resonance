import { z } from "zod";

import {
  VOICE_LANGUAGE_VALUES,
  VOICE_SAMPLE_ACCEPTED_MIME_TYPES,
  VOICE_SAMPLE_MAX_BYTES,
  VOICE_SAMPLE_MIN_BYTES,
} from "@/features/voices/constants";
import { VoiceCategory, VoiceVariant } from "@/generated/prisma/enums";

/** Zod 4 reads the literal union straight off Prisma's generated enum object. */
const voiceCategoryEnum = z.enum(VoiceCategory);
const voiceVariantEnum = z.enum(VoiceVariant);
const voiceLanguageEnum = z.enum(
  VOICE_LANGUAGE_VALUES as unknown as [string, ...string[]],
);

/**
 * Validation for everything crossing the network boundary into the voices
 * feature. Note what is *not* here: `organizationId`. It is never accepted from
 * a client and is always read from the Clerk session.
 */

export const voiceMetadataSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Give the voice a name of at least 2 characters.")
    .max(60, "Voice names are limited to 60 characters."),
  description: z
    .string()
    .trim()
    .max(300, "Descriptions are limited to 300 characters.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  category: voiceCategoryEnum.describe("Voice category"),
  language: voiceLanguageEnum.describe("BCP-47 language tag"),
});

export type VoiceMetadataInput = z.infer<typeof voiceMetadataSchema>;

const acceptedMimeTypes = new Set<string>(VOICE_SAMPLE_ACCEPTED_MIME_TYPES);

/**
 * The sample arrives as a `File` inside `FormData`. Validating type and size
 * here means an oversized or non-audio upload is rejected before it is read
 * into memory or written to storage.
 */
export const voiceSampleSchema = z
  .instanceof(File, { message: "Attach a voice sample." })
  .refine((file) => file.size >= VOICE_SAMPLE_MIN_BYTES, {
    message: "That sample is too short to clone a voice from.",
  })
  .refine((file) => file.size <= VOICE_SAMPLE_MAX_BYTES, {
    message: `Samples must be smaller than ${Math.round(
      VOICE_SAMPLE_MAX_BYTES / (1024 * 1024),
    )} MB.`,
  })
  .refine(
    (file) => acceptedMimeTypes.has(file.type.split(";")[0]!.trim().toLowerCase()),
    { message: "Upload a WAV, MP3, M4A, FLAC, OGG or WebM audio file." },
  );

export const createVoiceSchema = voiceMetadataSchema.extend({
  sample: voiceSampleSchema,
});

export const deleteVoiceSchema = z.object({
  voiceId: z.string().min(1),
});

export const listVoicesSchema = z.object({
  search: z.string().trim().max(100).optional(),
  category: voiceCategoryEnum.optional(),
  variant: voiceVariantEnum.optional(),
});

/** Turns a Zod error into the field-error map `ValidationError` carries. */
export function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}
