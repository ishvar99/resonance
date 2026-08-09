import { findAccessibleVoice } from "@/features/voices/data/queries";
import { toErrorResponse } from "@/lib/api/route-errors";
import { requireAuthContext } from "@/lib/auth/context";
import { streamStoredAudio } from "@/lib/audio/stream-response";
import { NotFoundError } from "@/lib/errors";
import { RATE_LIMITS, consumeRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Streams a voice's reference sample for in-app preview.
 *
 * System voices are readable by any signed-in workspace; custom voices only by
 * their owner. `findAccessibleVoice` encodes both rules.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/voices/[voiceId]/sample">,
) {
  try {
    const { organizationId } = await requireAuthContext();
    consumeRateLimit(`voice-sample:${organizationId}`, RATE_LIMITS.audioStream);

    const { voiceId } = await params;
    const voice = await findAccessibleVoice(organizationId, voiceId);

    if (!voice?.r2ObjectKey) {
      // Seeded system voices legitimately have no sample yet — the UI disables
      // preview via `hasSample`, and this is the backstop.
      throw new NotFoundError("This voice has no preview sample.");
    }

    return await streamStoredAudio({ key: voice.r2ObjectKey, request });
  } catch (error) {
    return toErrorResponse(error, { area: "voices", operation: "stream-sample" });
  }
}
