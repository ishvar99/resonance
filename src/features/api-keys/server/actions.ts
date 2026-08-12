"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  MAX_ACTIVE_API_KEYS,
  countActiveApiKeys,
  toApiKeySummary,
} from "@/features/api-keys/data/queries";
import type { ApiKeySummary } from "@/features/api-keys/types";
import { requireAuthContext, type AuthContext } from "@/lib/auth/context";
import { generateApiKeySecret } from "@/lib/auth/api-key";
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

const keyNameSchema = z
  .string()
  .trim()
  .min(2, "Give the key a name of at least 2 characters.")
  .max(60, "Key names are limited to 60 characters.");

/**
 * Key management is admin-only. A key is a durable, user-independent credential
 * for the whole workspace — handing every member the ability to mint one turns
 * "remove a teammate" into "rotate everything they might have created".
 */
function assertAdmin(context: AuthContext): void {
  if (context.organizationRole !== "org:admin") {
    throw new ForbiddenError(
      "Only workspace admins can manage API keys.",
      { reason: "NOT_ADMIN" },
    );
  }
}

export type CreatedApiKey = {
  key: ApiKeySummary;
  /** The full secret — the only time it ever leaves the server. */
  secret: string;
};

export async function createApiKeyAction(
  input: unknown,
): Promise<ActionResult<CreatedApiKey>> {
  try {
    const context = await requireAuthContext();
    assertAdmin(context);

    const parsedName = keyNameSchema.safeParse(
      typeof input === "object" && input !== null && "name" in input
        ? (input as { name: unknown }).name
        : undefined,
    );
    if (!parsedName.success) {
      throw new ValidationError(
        parsedName.error.issues[0]?.message ?? "Give the key a name.",
      );
    }

    const activeCount = await countActiveApiKeys(context.organizationId);
    if (activeCount >= MAX_ACTIVE_API_KEYS) {
      throw new ValidationError(
        `This workspace already has ${MAX_ACTIVE_API_KEYS} active keys. Revoke one before creating another.`,
      );
    }

    const generated = generateApiKeySecret();

    const key = await database.apiKey.create({
      data: {
        organizationId: context.organizationId,
        name: parsedName.data,
        keyHash: generated.keyHash,
        prefix: generated.prefix,
        last4: generated.last4,
        createdBy: context.userId,
      },
    });

    revalidatePath("/settings");

    // `secret` crosses the wire exactly once, here. It is not logged, not
    // stored, and not attached to any Sentry event.
    return actionSuccess({ key: toApiKeySummary(key), secret: generated.secret });
  } catch (error) {
    captureException(error, { tags: { area: "public-api", operation: "create-key" } });
    return toActionFailure(error);
  }
}

export async function revokeApiKeyAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const context = await requireAuthContext();
    assertAdmin(context);

    const keyId =
      typeof input === "object" && input !== null && "keyId" in input
        ? String((input as { keyId: unknown }).keyId)
        : null;
    if (!keyId) throw new ValidationError("That key could not be identified.");

    // Scoped update: a key id from another workspace matches zero rows and
    // reads as "not found" — exactly like a key that never existed.
    const { count } = await database.apiKey.updateMany({
      where: { id: keyId, organizationId: context.organizationId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (count === 0) {
      throw new NotFoundError("That API key no longer exists.");
    }

    revalidatePath("/settings");
    return actionSuccess({ id: keyId });
  } catch (error) {
    captureException(error, { tags: { area: "public-api", operation: "revoke-key" } });
    return toActionFailure(error);
  }
}
