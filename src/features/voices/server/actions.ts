"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@clerk/nextjs/server";

import { findOwnedCustomVoice, toVoiceSummary } from "@/features/voices/data/queries";
import {
  createVoiceSchema,
  deleteVoiceSchema,
  toFieldErrors,
} from "@/features/voices/server/schemas";
import type { VoiceSummary } from "@/features/voices/types";
import { requireAuthContext } from "@/lib/auth/context";
import { getBillingProvider } from "@/lib/billing";
import { requireEntitlement } from "@/lib/billing/checkout";
import { database } from "@/lib/database";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  actionSuccess,
  toActionFailure,
  type ActionResult,
} from "@/lib/errors";
import { captureException } from "@/lib/observability";
import { RATE_LIMITS, consumeRateLimit } from "@/lib/rate-limit";
import {
  extensionForAudioMimeType,
  getStorage,
  organizationVoiceSourceKey,
} from "@/lib/storage";

/**
 * Creates a custom voice for the **current** organization.
 *
 * Ordering matters: entitlement is checked before the sample is stored, and the
 * database row is created before the upload so the object key can embed the
 * voice id. A failed upload rolls the row back rather than leaving a voice that
 * can never be previewed or used.
 */
export async function createVoiceAction(
  formData: FormData,
): Promise<ActionResult<VoiceSummary>> {
  try {
    const { organizationId, userId } = await requireAuthContext();
    consumeRateLimit(`create-voice:${organizationId}`, RATE_LIMITS.createVoice);

    const parsed = createVoiceSchema.safeParse({
      name: formData.get("name"),
      description: formData.get("description") ?? undefined,
      category: formData.get("category"),
      language: formData.get("language"),
      sample: formData.get("sample"),
    });

    if (!parsed.success) {
      throw new ValidationError(
        "Please check the highlighted fields and try again.",
        toFieldErrors(parsed.error),
      );
    }

    const { name, description, category, language, sample } = parsed.data;

    const user = await currentUser();
    await requireEntitlement({
      organizationId,
      userId,
      meter: "VOICE_CREATION",
      quantity: 1,
      userEmail: user?.primaryEmailAddress?.emailAddress ?? null,
    });

    const voice = await database.voice.create({
      data: {
        organizationId,
        name,
        description: description ?? null,
        category,
        language,
        variant: "CUSTOM",
        createdBy: userId,
      },
    });

    const key = organizationVoiceSourceKey(
      organizationId,
      voice.id,
      extensionForAudioMimeType(sample.type),
    );

    try {
      await getStorage().put({
        key,
        body: new Uint8Array(await sample.arrayBuffer()),
        contentType: sample.type || "audio/wav",
        metadata: { organizationId, voiceId: voice.id },
      });
    } catch (uploadError) {
      // Never leave a voice row pointing at nothing.
      await database.voice.delete({ where: { id: voice.id } }).catch(() => {});
      throw uploadError;
    }

    const stored = await database.voice.update({
      where: { id: voice.id },
      data: { r2ObjectKey: key },
    });

    await getBillingProvider().recordUsage({
      organizationId,
      meter: "VOICE_CREATION",
      quantity: 1,
      voiceId: voice.id,
      idempotencyKey: `voice:${voice.id}`,
    });

    revalidatePath("/voices");
    revalidatePath("/text-to-speech");
    revalidatePath("/");

    return actionSuccess(toVoiceSummary(stored));
  } catch (error) {
    captureException(error, { tags: { area: "voices", operation: "create" } });
    return toActionFailure(error);
  }
}

/**
 * Deletes a custom voice owned by the current organization.
 *
 * Generations are intentionally preserved — `voiceId` is set to NULL by the
 * schema and the `voiceName` snapshot keeps history readable.
 */
export async function deleteVoiceAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { organizationId } = await requireAuthContext();

    const parsed = deleteVoiceSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError("That voice could not be identified.");
    }

    const voice = await findOwnedCustomVoice(organizationId, parsed.data.voiceId);

    if (!voice) {
      // Distinguish "system voice" (a real, explainable refusal) from
      // "belongs to someone else" (which must look like a 404).
      const exists = await database.voice.findUnique({
        where: { id: parsed.data.voiceId },
        select: { variant: true },
      });
      if (exists?.variant === "SYSTEM") {
        throw new ForbiddenError("System voices cannot be deleted.");
      }
      throw new NotFoundError("That voice no longer exists.");
    }

    if (voice.r2ObjectKey) {
      // Best effort — an orphaned object is preferable to a failed delete.
      await getStorage().delete(voice.r2ObjectKey).catch((cause) => {
        captureException(cause, {
          tags: { area: "voices", operation: "delete-object" },
          extra: { organizationId, voiceId: voice.id },
        });
      });
    }

    await database.voice.delete({ where: { id: voice.id } });

    revalidatePath("/voices");
    revalidatePath("/text-to-speech");
    revalidatePath("/history");

    return actionSuccess({ id: voice.id });
  } catch (error) {
    captureException(error, { tags: { area: "voices", operation: "delete" } });
    return toActionFailure(error);
  }
}
