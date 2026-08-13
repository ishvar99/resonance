"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@clerk/nextjs/server";

import { performSpeechGeneration } from "@/features/text-to-speech/server/generate";
import { generateSpeechSchema } from "@/features/text-to-speech/server/schemas";
import { toFieldErrors } from "@/features/voices/server/schemas";
import { requireAuthContext } from "@/lib/auth/context";
import { database } from "@/lib/database";
import {
  NotFoundError,
  ValidationError,
  actionSuccess,
  toActionFailure,
  type ActionResult,
} from "@/lib/errors";
import { captureException } from "@/lib/observability";

export type GenerateSpeechResult = {
  generationId: string;
  /** True when development preview audio was returned instead of real speech. */
  preview: boolean;
  /** True when the text was queued for the worker; the result page polls. */
  queued: boolean;
};

/**
 * Dashboard entry point for speech generation.
 *
 * Authentication and input validation happen here; everything downstream —
 * rate limiting, voice ownership, the billing gate, the PENDING/FAILED
 * lifecycle — lives in `performSpeechGeneration`, which is shared with the
 * public REST API so the two can never drift.
 */
export async function generateSpeechAction(
  input: unknown,
): Promise<ActionResult<GenerateSpeechResult>> {
  try {
    const { organizationId, userId } = await requireAuthContext();

    const parsed = generateSpeechSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        "Check the text and settings before generating.",
        toFieldErrors(parsed.error),
      );
    }

    const user = await currentUser();

    const outcome = await performSpeechGeneration({
      organizationId,
      userId,
      userEmail: user?.primaryEmailAddress?.emailAddress ?? null,
      ...parsed.data,
      source: "dashboard",
    });

    // The pipeline itself is request-context-free (the worker runs it too),
    // so cache invalidation lives here at the action layer.
    revalidatePath("/history");
    revalidatePath("/");

    return actionSuccess({
      generationId: outcome.generationId,
      preview: outcome.status === "completed" ? outcome.preview : false,
      queued: outcome.status === "queued",
    });
  } catch (error) {
    captureException(error, {
      tags: { area: "text-to-speech", operation: "generate" },
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

    if (!generationId) {
      throw new ValidationError("That generation could not be identified.");
    }

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
