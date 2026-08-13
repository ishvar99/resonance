import { getBillingProvider } from "@/lib/billing";
import { getSpeechGenerator, type GeneratedAudio } from "@/lib/chatterbox";
import { database } from "@/lib/database";
import { GenerationError, isApplicationError } from "@/lib/errors";
import { captureException } from "@/lib/observability";
import { generationAudioKey, getStorage } from "@/lib/storage";
import type { GenerationModel } from "@/generated/prisma/models";

/**
 * The processing half of a generation: Chatterbox → storage → COMPLETED →
 * usage. Runs identically in two places — the inline fast-path inside a
 * request, and the queue worker (`npm run worker`) in its own process — so it
 * must not assume a Next.js request context. That is why there is no
 * `revalidatePath` here (it throws outside a request; dashboard pages are all
 * dynamic and the result page polls, so nothing is lost) and no `server-only`
 * import (the worker runs under tsx with `--conditions=react-server`).
 *
 * Callers must have CLAIMED the row first (status PROCESSING) — entitlement,
 * ownership and rate limits were all enforced at enqueue time.
 */
export async function processClaimedGeneration(
  generation: GenerationModel,
): Promise<GeneratedAudio> {
  // Fresh read: the voice may have been deleted while the job sat queued. The
  // relation is SET NULL, so we fall back to the model's default voice and the
  // row's voiceName snapshot keeps the history entry labelled.
  const voice = generation.voiceId
    ? await database.voice.findUnique({ where: { id: generation.voiceId } })
    : null;

  const storage = getStorage();

  // Hand the GPU service a short-lived URL rather than bucket credentials.
  const voiceUrl = voice?.r2ObjectKey
    ? await storage.createSignedDownloadUrl(voice.r2ObjectKey, 600).catch(() => null)
    : null;

  const audio = await getSpeechGenerator().generate({
    text: generation.text,
    voiceKey: voice?.r2ObjectKey ?? null,
    voiceUrl,
    temperature: generation.temperature,
    topP: generation.topP,
    topK: generation.topK,
    repetitionPenalty: generation.repetitionPenalty,
    requestId: generation.id,
  });

  const key = generationAudioKey(generation.organizationId, generation.id);
  await storage.put({
    key,
    body: audio.audio,
    contentType: audio.contentType,
    metadata: {
      organizationId: generation.organizationId,
      generationId: generation.id,
    },
  });

  await database.generation.update({
    where: { id: generation.id },
    data: {
      r2ObjectKey: key,
      status: "COMPLETED",
      durationSecs: audio.durationSeconds,
      errorMessage: null,
    },
  });

  await getBillingProvider().recordUsage({
    organizationId: generation.organizationId,
    meter: "CHARACTERS",
    quantity: generation.characterCount,
    generationId: generation.id,
    idempotencyKey: `generation:${generation.id}`,
  });

  return audio;
}

/**
 * Marks a generation FAILED. Only `ApplicationError` messages — written to be
 * user-facing — are persisted; anything else gets a generic message so an
 * upstream stack trace never lands in the UI. Never throws: failure handling
 * must not mask the original error.
 */
export async function failGeneration(
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
}
