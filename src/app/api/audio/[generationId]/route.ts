import { findGeneration } from "@/features/text-to-speech/data/queries";
import { toErrorResponse } from "@/lib/api/route-errors";
import { requireAuthContext } from "@/lib/auth/context";
import { streamStoredAudio } from "@/lib/audio/stream-response";
import { NotFoundError } from "@/lib/errors";
import { RATE_LIMITS, consumeRateLimit } from "@/lib/rate-limit";

// Streams from object storage, so it must not be statically optimised.
export const dynamic = "force-dynamic";

/**
 * Secure audio proxy.
 *
 * The bucket stays private; this is the only way a browser reaches generated
 * audio. `findGeneration` filters on the session's organization, so requesting
 * another workspace's generation id returns 404 — the same response as an id
 * that does not exist, which stops the endpoint being used to enumerate ids.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/audio/[generationId]">,
) {
  try {
    const { organizationId } = await requireAuthContext();
    consumeRateLimit(`audio:${organizationId}`, RATE_LIMITS.audioStream);

    const { generationId } = await params;
    const generation = await findGeneration(organizationId, generationId);

    if (!generation?.r2ObjectKey) {
      throw new NotFoundError("That audio is not available.");
    }

    const url = new URL(request.url);
    const download = url.searchParams.get("download") === "1";

    return await streamStoredAudio({
      key: generation.r2ObjectKey,
      request,
      downloadFilename: download
        ? `${slugify(generation.voiceName)}-${generation.id.slice(0, 8)}.wav`
        : undefined,
    });
  } catch (error) {
    return toErrorResponse(error, { area: "audio", operation: "stream-generation" });
  }
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "resonance"
  );
}
