import { findGeneration } from "@/features/text-to-speech/data/queries";
import { toErrorResponse } from "@/lib/api/route-errors";
import { authenticateApiKey } from "@/lib/auth/api-key";
import { streamStoredAudio } from "@/lib/audio/stream-response";
import { NotFoundError } from "@/lib/errors";
import { RATE_LIMITS, consumeRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/generations/{id}/audio — the finished audio for API clients.
 *
 * Same ownership rule and range support as the dashboard's audio proxy, but
 * authenticated by API key. A generation that is still queued or failed has no
 * audio and 404s; poll the sibling status endpoint first.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/v1/generations/[generationId]/audio">,
) {
  try {
    const principal = await authenticateApiKey(request);
    consumeRateLimit(
      `audio:${principal.organizationId}`,
      RATE_LIMITS.audioStream,
    );

    const { generationId } = await params;
    const generation = await findGeneration(principal.organizationId, generationId);

    if (!generation?.r2ObjectKey || generation.status !== "COMPLETED") {
      throw new NotFoundError("That audio is not available.");
    }

    return await streamStoredAudio({ key: generation.r2ObjectKey, request });
  } catch (error) {
    return toErrorResponse(error, { area: "public-api", operation: "get-audio" });
  }
}
