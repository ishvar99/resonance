import "server-only";

import { revalidatePath } from "next/cache";

import { findAccessibleVoice } from "@/features/voices/data/queries";
import { getBillingProvider } from "@/lib/billing";
import { requireEntitlement } from "@/lib/billing/checkout";
import { getSpeechGenerator, type GeneratedAudio } from "@/lib/chatterbox";
import { database } from "@/lib/database";
import {
  BillingRequiredError,
  GenerationError,
  NotFoundError,
  isApplicationError,
} from "@/lib/errors";
import { captureException } from "@/lib/observability";
import { RATE_LIMITS, consumeRateLimit } from "@/lib/rate-limit";
import { generationAudioKey, getStorage } from "@/lib/storage";

/**
 * The one generation pipeline, shared by the dashboard (server action) and the
 * public REST API (/api/v1/text-to-speech). There must never be two copies of
 * this flow — the billing gate and the tenant checks live here or nowhere.
 *
 * Callers are responsible for AUTHENTICATION (who is asking) and for input
 * validation; this function is responsible for everything after:
 *
 *  1. rate limit per organization — shared across entry points, so an API
 *     client and the dashboard draw from the same GPU budget,
 *  2. voice ownership: SYSTEM voices for everyone, CUSTOM only for the owner —
 *     a foreign voice is indistinguishable from a nonexistent one,
 *  3. billing entitlement BEFORE any GPU work,
 *  4. persist a PENDING row so a crash mid-flight stays visible in history,
 *  5. call Chatterbox, store the audio, mark COMPLETED,
 *  6. record usage only after the work actually succeeded.
 *
 * A failure after step 4 marks the row FAILED rather than deleting it.
 */
export type SpeechGenerationRequest = {
  organizationId: string;
  /** Clerk user id, or null when the caller authenticated with an API key. */
  userId: string | null;
  /** Used only to prefill checkout when entitlement fails for a dashboard user. */
  userEmail?: string | null;

  text: string;
  voiceId: string;
  temperature: number;
  topP: number;
  topK: number;
  repetitionPenalty: number;

  /**
   * Where the request came from. Dashboard failures get a checkout URL attached
   * (the UI turns it into an Upgrade toast); API failures return a structured
   * 402 without one, since there is no browser to redirect.
   */
  source: "dashboard" | "api";
};

export type SpeechGenerationOutcome = {
  generationId: string;
  audio: GeneratedAudio;
  /** True when the development adapter produced placeholder audio. */
  preview: boolean;
  characterCount: number;
};

export async function performSpeechGeneration(
  request: SpeechGenerationRequest,
): Promise<SpeechGenerationOutcome> {
  const { organizationId } = request;

  consumeRateLimit(`generate:${organizationId}`, RATE_LIMITS.generateSpeech);

  const voice = await findAccessibleVoice(organizationId, request.voiceId);
  if (!voice) {
    throw new NotFoundError("That voice is not available in this workspace.");
  }

  const characterCount = request.text.length;

  if (request.source === "dashboard") {
    await requireEntitlement({
      organizationId,
      userId: request.userId ?? "unknown",
      meter: "CHARACTERS",
      quantity: characterCount,
      userEmail: request.userEmail ?? null,
    });
  } else {
    // No browser on the other end — return the structured 402 without
    // spending a provider call on a checkout session nobody can open.
    const check = await getBillingProvider().checkEntitlement(
      organizationId,
      "CHARACTERS",
      characterCount,
    );
    if (!check.allowed) {
      throw new BillingRequiredError({
        message: check.message,
        reason: check.reason,
        context: { organizationId, meter: "CHARACTERS" },
      });
    }
  }

  const generation = await database.generation.create({
    data: {
      organizationId,
      voiceId: voice.id,
      voiceName: voice.name,
      text: request.text,
      temperature: request.temperature,
      topP: request.topP,
      topK: request.topK,
      repetitionPenalty: request.repetitionPenalty,
      characterCount,
      status: "PENDING",
      createdBy: request.userId,
    },
  });

  try {
    // Hand the GPU service a short-lived URL rather than bucket credentials.
    const voiceUrl = voice.r2ObjectKey
      ? await getStorage()
          .createSignedDownloadUrl(voice.r2ObjectKey, 600)
          .catch(() => null)
      : null;

    const audio = await getSpeechGenerator().generate({
      text: request.text,
      voiceKey: voice.r2ObjectKey,
      voiceUrl,
      temperature: request.temperature,
      topP: request.topP,
      topK: request.topK,
      repetitionPenalty: request.repetitionPenalty,
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

    return {
      generationId: generation.id,
      audio,
      preview: audio.provider === "mock",
      characterCount,
    };
  } catch (error) {
    await markGenerationFailed(generation.id, error);
    throw error;
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
