import { performSpeechGeneration } from "@/features/text-to-speech/server/generate";
import { publicGenerateSchema } from "@/features/text-to-speech/server/schemas";
import { toFieldErrors } from "@/features/voices/server/schemas";
import { toErrorResponse } from "@/lib/api/route-errors";
import { authenticateApiKey } from "@/lib/auth/api-key";
import { ValidationError } from "@/lib/errors";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/text-to-speech — the public generation endpoint.
 *
 * Authenticated by API key, not by Clerk: this is a server-to-server surface
 * and the browser dashboard never calls it. Tenant identity comes exclusively
 * from the key; a `organization_id` in the body is stripped by the schema.
 *
 * Runs the exact same pipeline as the dashboard (`performSpeechGeneration`) —
 * same rate limit bucket, same voice-ownership rule, same billing gate, same
 * PENDING/FAILED lifecycle — and streams the WAV straight back. The
 * generation also appears in the workspace's history like any other.
 *
 * Success: 200 audio/wav with X-Generation-Id / X-Characters-Billed headers.
 * Failures: JSON `{ error: { code, message } }` — 401 bad key, 400 validation,
 * 404 foreign or unknown voice, 402 out of entitlement, 429 rate limited.
 */
export async function POST(request: Request) {
  try {
    const principal = await authenticateApiKey(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ValidationError("The request body must be valid JSON.");
    }

    const parsed = publicGenerateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid request. Check the field errors.",
        toFieldErrors(parsed.error),
      );
    }

    const outcome = await performSpeechGeneration({
      organizationId: principal.organizationId,
      userId: null,
      ...parsed.data,
      source: "api",
    });

    return new Response(new Uint8Array(outcome.audio.audio), {
      status: 200,
      headers: {
        "Content-Type": outcome.audio.contentType,
        "Content-Length": String(outcome.audio.audio.byteLength),
        "X-Generation-Id": outcome.generationId,
        "X-Characters-Billed": String(outcome.characterCount),
        ...(outcome.preview ? { "X-Resonance-Preview": "development" } : {}),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error, { area: "public-api", operation: "generate" });
  }
}
