"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@clerk/nextjs/server";

import { generateSpeechSchema } from "@/features/text-to-speech/server/schemas";
import { findAccessibleVoice } from "@/features/voices/data/queries";
import { toFieldErrors } from "@/features/voices/server/schemas";
import { requireAuthContext } from "@/lib/auth/context";
import { getBillingProvider } from "@/lib/billing";
import { requireEntitlement } from "@/lib/billing/checkout";
import { getSpeechGenerator } from "@/lib/chatterbox";
import { database } from "@/lib/database";
import {
  GenerationError,
  NotFoundError,
  ValidationError,
  actionSuccess,
  isApplicationError,
  toActionFailure,
  type ActionResult,
} from "@/lib/errors";
import { captureException } from "@/lib/observability";
import { RATE_LIMITS, consumeRateLimit } from "@/lib/rate-limit";
import { generationAudioKey, getStorage } from "@/lib/storage";

export type GenerateSpeechResult = {
  generationId: string;
  /** True when development preview audio was returned instead of real speech. */
  preview: boolean;
};

/**
 * The end-to-end generation flow.
 *
 * Sequencing is deliberate:
 *  1. authenticate and derive the organization from the session,
 *  2. validate input and *voice ownership* — a custom voice from another
 *     workspace is indistinguishable from one that does not exist,
 *  3. check billing entitlement BEFORE any GPU work,
 *  4. persist a PENDING row so a crash mid-flight is still visible in history,
 *  5. call Chatterbox, store the audio, then mark COMPLETED,
 *  6. record usage only after the work actually succeeded.
 *
 * A failure after step 4 marks the row FAILED rather than deleting it — the
 * history page must never silently lose a generation.
 */
export async function generateSpeechAction(
  input: unknown,
): Promise<ActionResult<GenerateSpeechResult>> {
  let generationId: string | null = null;

  try {
    const { organizationId, userId } = await requireAuthContext();
    consumeRateLimit(`generate:${organizationId}`, RATE_LIMITS.generateSpeech);

    const parsed = generateSpeechSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        "Check the text and settings before generating.",
        toFieldErrors(parsed.error),
      );
    }

    const { text, voiceId, temperature, topP, topK, repetitionPenalty } =
      parsed.data;

    // Ownership check. `findAccessibleVoice` allows SYSTEM voices for everyone
    // and CUSTOM voices only for the owning organization.
    const voice = await findAccessibleVoice(organizationId, voiceId);
    if (!voice) {
      throw new NotFoundError("That voice is not available in this workspace.");
    }

    const characterCount = text.length;

    const user = await currentUser();
    await requireEntitlement({
      organizationId,
      userId,
      meter: "CHARACTERS",
      quantity: characterCount,
      userEmail: user?.primaryEmailAddress?.emailAddress ?? null,
    });

    const generation = await database.generation.create({
      data: {
        organizationId,
        voiceId: voice.id,
        voiceName: voice.name,
        text,
        temperature,
        topP,
        topK,
        repetitionPenalty,
        characterCount,
        status: "PENDING",
        createdBy: userId,
      },
    });
    generationId = generation.id;

    // Hand the GPU service a short-lived URL rather than bucket credentials.
    const voiceUrl = voice.r2ObjectKey
      ? await getStorage()
          .createSignedDownloadUrl(voice.r2ObjectKey, 600)
          .catch(() => null)
      : null;

    const audio = await getSpeechGenerator().generate({
      text,
      voiceKey: voice.r2ObjectKey,
      voiceUrl,
      temperature,
      topP,
      topK,
      repetitionPenalty,
      requestId: generation.id,
    });

    const key = generationAudioKey(organizationId, generation.id);
    await getStorage().put({
      key,
      body: audio.audio,
      contentType: audio.contentType,
      metadata: { organizationId, generationId: generation.id },
    });

    await database.generation.update({
      where: { id: generation.id },
      data: {
        r2ObjectKey: key,
        status: "COMPLETED",
        durationSecs: audio.durationSeconds,
      },
    });

    await getBillingProvider().recordUsage({
      organizationId,
      meter: "CHARACTERS",
      quantity: characterCount,
      generationId: generation.id,
      idempotencyKey: `generation:${generation.id}`,
    });

    revalidatePath("/history");
    revalidatePath("/");

    return actionSuccess({
      generationId: generation.id,
      preview: audio.provider === "mock",
    });
  } catch (error) {
    if (generationId) {
      await markGenerationFailed(generationId, error);
    }

    captureException(error, {
      tags: { area: "text-to-speech", operation: "generate" },
      extra: generationId ? { generationId } : undefined,
    });

    return toActionFailure(error);
  }
}

/**
 * Retries a previous generation with the same text, voice and settings.
 * Produces a new row so the original failure stays in history.
 */
export async function regenerateAction(
  input: unknown,
): Promise<ActionResult<GenerateSpeechResult>> {
  try {
    const { organizationId } = await requireAuthContext();

    const generationId =
      typeof input === "object" && input !== null && "generationId" in input
        ? String((input as { generationId: unknown }).generationId)
        : null;

    if (!generationId) throw new ValidationError("That generation could not be identified.");

    const previous = await database.generation.findFirst({
      where: { id: generationId, organizationId },
    });
    if (!previous) throw new NotFoundError("That generation no longer exists.");

    if (!previous.voiceId) {
      throw new ValidationError(
        "The voice used for this generation has been deleted. Pick a new voice to regenerate.",
      );
    }

    return generateSpeechAction({
      text: previous.text,
      voiceId: previous.voiceId,
      temperature: previous.temperature,
      topP: previous.topP,
      topK: previous.topK,
      repetitionPenalty: previous.repetitionPenalty,
    });
  } catch (error) {
    captureException(error, {
      tags: { area: "text-to-speech", operation: "regenerate" },
    });
    return toActionFailure(error);
  }
}

/**
 * Records why a generation failed. Only `ApplicationError` messages — which are
 * written to be user-facing — are persisted; anything else gets a generic
 * message so an upstream stack trace never lands in the UI.
 */
async function markGenerationFailed(
  generationId: string,
  error: unknown,
): Promise<void> {
  const errorMessage = isApplicationError(error)
    ? error.message
    : new GenerationError().message;

  await database.generation
    .update({
      where: { id: generationId },
      data: { status: "FAILED", errorMessage },
    })
    .catch((cause) => {
      captureException(cause, {
        tags: { area: "text-to-speech", operation: "mark-failed" },
        extra: { generationId },
      });
    });

  revalidatePath("/history");
}
