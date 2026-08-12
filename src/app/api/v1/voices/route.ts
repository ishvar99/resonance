import { NextResponse } from "next/server";

import { listVoices } from "@/features/voices/data/queries";
import { toErrorResponse } from "@/lib/api/route-errors";
import { authenticateApiKey } from "@/lib/auth/api-key";
import { RATE_LIMITS, consumeRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/voices — voice discovery for API clients.
 *
 * Returns the voices the key's organization may generate with: the global
 * system library plus the workspace's own custom voices. The `id` values here
 * are what `POST /api/v1/text-to-speech` accepts as `voice_id`.
 */
export async function GET(request: Request) {
  try {
    const principal = await authenticateApiKey(request);
    consumeRateLimit(
      `public-api:${principal.organizationId}`,
      RATE_LIMITS.publicApiRead,
    );

    const voices = await listVoices(principal.organizationId);

    return NextResponse.json({
      voices: voices.map((voice) => ({
        id: voice.id,
        name: voice.name,
        description: voice.description,
        category: voice.category,
        language: voice.language,
        variant: voice.variant,
        has_sample: voice.hasSample,
        created_at: voice.createdAt,
      })),
    });
  } catch (error) {
    return toErrorResponse(error, { area: "public-api", operation: "list-voices" });
  }
}
