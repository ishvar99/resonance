import "server-only";

import {
  failGeneration,
  processClaimedGeneration,
} from "@/features/text-to-speech/server/pipeline";
import { findAccessibleVoice } from "@/features/voices/data/queries";
import { getBillingProvider } from "@/lib/billing";
import { requireEntitlement } from "@/lib/billing/checkout";
import type { GeneratedAudio } from "@/lib/chatterbox";
import { database } from "@/lib/database";
import { env } from "@/lib/environment";
import { BillingRequiredError, NotFoundError } from "@/lib/errors";
import { RATE_LIMITS, consumeRateLimit } from "@/lib/rate-limit";

/**
 * Entry point shared by the dashboard action and the public REST API.
 *
 * The flow is split in two around the queue:
 *
 *   enqueue (here, in the request)    — rate limit, voice ownership, billing
 *                                       entitlement, persist the PENDING row.
 *   process (pipeline.ts, anywhere)   — Chatterbox, storage, COMPLETED, usage.
 *
 * Texts at or under GENERATION_INLINE_MAX_CHARS are processed inline so the
 * common case stays a single snappy request. Longer texts return immediately
 * as `queued`; the worker (`npm run worker`) claims and processes them, and
 * the result page polls until the row settles. With the default threshold
 * (= the request maximum) everything runs inline and no worker is required.
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

export type SpeechGenerationOutcome =
  | {
      status: "completed";
      generationId: string;
      audio: GeneratedAudio;
      /** True when the development adapter produced placeholder audio. */
      preview: boolean;
      characterCount: number;
    }
  | {
      status: "queued";
      generationId: string;
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

  const created = await database.generation.create({
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

  if (characterCount > env.GENERATION_INLINE_MAX_CHARS) {
    // The worker takes it from here. Entitlement was checked above, so a
    // queued job never turns into a surprise bill gate later.
    return { status: "queued", generationId: created.id, characterCount };
  }

  // Inline fast-path: claim the row we just created, conditionally on it
  // still being PENDING — a polling worker may have grabbed it in the
  // intervening milliseconds. Losing that race is fine: whoever claimed it
  // will finish it, so we just report it as queued and the result page polls.
  const { count } = await database.generation.updateMany({
    where: { id: created.id, status: "PENDING" },
    data: {
      status: "PROCESSING",
      claimedAt: new Date(),
      claimedBy: "inline",
      attempts: 1,
    },
  });

  if (count === 0) {
    return { status: "queued", generationId: created.id, characterCount };
  }

  try {
    const audio = await processClaimedGeneration(created);
    return {
      status: "completed",
      generationId: created.id,
      audio,
      preview: audio.provider === "mock",
      characterCount,
    };
  } catch (error) {
    // Inline failures surface immediately — the user is watching a spinner,
    // not waiting on a queue, so no retry-with-backoff here.
    await failGeneration(created.id, error);
    throw error;
  }
}
