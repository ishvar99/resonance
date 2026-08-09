import "server-only";

import { GenerationError } from "@/lib/errors";
import type {
  GeneratedAudio,
  SpeechGenerationInput,
  SpeechGenerator,
} from "@/lib/chatterbox/types";

export type ChatterboxConfig = {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
};

/**
 * HTTP client for the self-hosted Chatterbox GPU service.
 *
 * The API key lives only in this process — the browser never talks to the
 * inference service directly. The service replies with `audio/wav` bytes plus
 * `X-Duration-Seconds` / `X-Sample-Rate` headers.
 */
export class ChatterboxSpeechGenerator implements SpeechGenerator {
  readonly kind = "chatterbox" as const;

  constructor(private readonly config: ChatterboxConfig) {}

  async generate(input: SpeechGenerationInput): Promise<GeneratedAudio> {
    const endpoint = new URL("/generate", this.config.baseUrl);

    // `AbortSignal.timeout` frees the socket if the GPU worker stalls, instead
    // of holding a Next.js request open until the platform kills it.
    const signal = AbortSignal.timeout(this.config.timeoutMs);

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "audio/wav",
          "X-API-Key": this.config.apiKey,
        },
        body: JSON.stringify({
          prompt: input.text,
          voice_key: input.voiceKey,
          voice_url: input.voiceUrl ?? null,
          temperature: input.temperature,
          top_p: input.topP,
          top_k: input.topK,
          repetition_penalty: input.repetitionPenalty,
          loudness: input.loudness ?? 1.0,
          request_id: input.requestId ?? null,
        }),
        cache: "no-store",
      });
    } catch (cause) {
      const timedOut = cause instanceof DOMException && cause.name === "TimeoutError";
      throw new GenerationError(
        timedOut
          ? "The voice engine took too long to respond. Please try a shorter passage."
          : "We could not reach the voice engine. Please try again shortly.",
        cause,
        { requestId: input.requestId },
      );
    }

    if (!response.ok) {
      throw new GenerationError(
        await describeFailure(response),
        undefined,
        { status: response.status, requestId: input.requestId },
      );
    }

    const audio = new Uint8Array(await response.arrayBuffer());
    if (audio.byteLength === 0) {
      throw new GenerationError("The voice engine returned an empty result.");
    }

    return {
      audio,
      contentType: response.headers.get("Content-Type") ?? "audio/wav",
      sampleRate: numericHeader(response, "X-Sample-Rate"),
      durationSeconds: numericHeader(response, "X-Duration-Seconds"),
      provider: "chatterbox",
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; detail?: string }> {
    try {
      const response = await fetch(new URL("/health", this.config.baseUrl), {
        headers: { "X-API-Key": this.config.apiKey },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
      if (!response.ok) {
        return { healthy: false, detail: `Service returned ${response.status}` };
      }
      const payload = (await response.json()) as { model_loaded?: boolean };
      return payload.model_loaded === false
        ? { healthy: false, detail: "Model is still loading" }
        : { healthy: true };
    } catch {
      return { healthy: false, detail: "Service unreachable" };
    }
  }
}

function numericHeader(response: Response, name: string): number | null {
  const raw = response.headers.get(name);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * Turns a failure response into a message that is safe to show a user — the
 * upstream body may contain stack traces, so only a known `detail` string is
 * ever surfaced, and only for client-side (4xx) errors.
 */
async function describeFailure(response: Response): Promise<string> {
  if (response.status === 401 || response.status === 403) {
    return "The voice engine rejected this request. Please contact support.";
  }
  if (response.status === 429) {
    return "The voice engine is busy right now. Please try again in a moment.";
  }
  if (response.status === 422 || response.status === 400) {
    try {
      const payload = (await response.json()) as { detail?: unknown };
      if (typeof payload.detail === "string" && payload.detail.length < 200) {
        return payload.detail;
      }
    } catch {
      // Fall through to the generic message.
    }
    return "The voice engine could not process that request.";
  }
  return "The voice engine failed to generate audio. Please try again.";
}
