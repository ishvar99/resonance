import { NextResponse } from "next/server";

import {
  findGeneration,
  toGenerationSummary,
} from "@/features/text-to-speech/data/queries";
import { toErrorResponse } from "@/lib/api/route-errors";
import { authenticateApiKey } from "@/lib/auth/api-key";
import { NotFoundError } from "@/lib/errors";
import { RATE_LIMITS, consumeRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/generations/{id} — status polling for queued generations.
 *
 * Scoped to the key's organization; a foreign id is a 404 exactly like a
 * nonexistent one. `status` moves PENDING → PROCESSING → COMPLETED | FAILED;
 * callers should poll until it settles, then fetch `audio_url`.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/v1/generations/[generationId]">,
) {
  try {
    const principal = await authenticateApiKey(request);
    consumeRateLimit(
      `public-api:${principal.organizationId}`,
      RATE_LIMITS.publicApiRead,
    );

    const { generationId } = await params;
    const generation = await findGeneration(principal.organizationId, generationId);
    if (!generation) throw new NotFoundError("That generation does not exist.");

    const summary = toGenerationSummary(generation);

    return NextResponse.json(
      {
        generation_id: summary.id,
        status: summary.status.toLowerCase(),
        voice_id: summary.voiceId,
        voice_name: summary.voiceName,
        character_count: summary.characterCount,
        duration_seconds: summary.durationSecs,
        error: summary.status === "FAILED" ? summary.errorMessage : null,
        audio_url: summary.hasAudio
          ? `/api/v1/generations/${summary.id}/audio`
          : null,
        created_at: summary.createdAt,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return toErrorResponse(error, { area: "public-api", operation: "get-generation" });
  }
}
