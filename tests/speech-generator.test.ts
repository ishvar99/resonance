import { describe, expect, it } from "vitest";

import { MockSpeechGenerator } from "@/lib/chatterbox/mock";
import { readWavInfo } from "@/lib/audio/wav";
import { consumeRateLimit, resetRateLimits } from "@/lib/rate-limit";
import { RateLimitError } from "@/lib/errors";

const generator = new MockSpeechGenerator();

const baseInput = {
  text: "Resonance turns text into speech.",
  voiceKey: "system/voices/system_aaron/source.wav",
  temperature: 0.8,
  topP: 0.95,
  topK: 1000,
  repetitionPenalty: 1.2,
};

describe("development speech generator", () => {
  it("produces a genuinely playable WAV file", async () => {
    const result = await generator.generate(baseInput);
    const info = readWavInfo(result.audio);

    expect(info).not.toBeNull();
    expect(info!.sampleRate).toBe(24_000);
    expect(info!.channels).toBe(1);
    expect(info!.bitsPerSample).toBe(16);
    expect(info!.durationSeconds).toBeGreaterThan(0);
  });

  it("labels its output so the UI can warn the user", async () => {
    const result = await generator.generate(baseInput);
    expect(result.provider).toBe("mock");
  });

  it("scales duration with the length of the text", async () => {
    const short = await generator.generate({ ...baseInput, text: "Hi." });
    const long = await generator.generate({
      ...baseInput,
      text: "Hello there. ".repeat(40),
    });

    expect(long.durationSeconds!).toBeGreaterThan(short.durationSeconds!);
  });

  it("is deterministic for identical input", async () => {
    const first = await generator.generate(baseInput);
    const second = await generator.generate(baseInput);
    expect(Buffer.from(first.audio)).toEqual(Buffer.from(second.audio));
  });

  it("produces different audio for a different voice", async () => {
    const a = await generator.generate(baseInput);
    const b = await generator.generate({ ...baseInput, voiceKey: "other/voice.wav" });
    expect(Buffer.from(a.audio)).not.toEqual(Buffer.from(b.audio));
  });

  it("reports the reported duration honestly", async () => {
    const result = await generator.generate(baseInput);
    const info = readWavInfo(result.audio)!;
    // The header must agree with what we told the caller, within rounding.
    expect(Math.abs(info.durationSeconds - result.durationSeconds!)).toBeLessThan(0.1);
  });
});

describe("rate limiting", () => {
  it("allows requests up to the limit then rejects", () => {
    resetRateLimits();
    const rule = { limit: 3, windowMs: 60_000 };

    expect(() => consumeRateLimit("org_a", rule, 0)).not.toThrow();
    expect(() => consumeRateLimit("org_a", rule, 0)).not.toThrow();
    expect(() => consumeRateLimit("org_a", rule, 0)).not.toThrow();
    expect(() => consumeRateLimit("org_a", rule, 0)).toThrow(RateLimitError);
  });

  it("keeps organizations in separate buckets", () => {
    resetRateLimits();
    const rule = { limit: 1, windowMs: 60_000 };

    expect(() => consumeRateLimit("org_a", rule, 0)).not.toThrow();
    // One workspace exhausting its quota must not affect another.
    expect(() => consumeRateLimit("org_b", rule, 0)).not.toThrow();
    expect(() => consumeRateLimit("org_a", rule, 0)).toThrow(RateLimitError);
  });

  it("resets once the window has elapsed", () => {
    resetRateLimits();
    const rule = { limit: 1, windowMs: 1_000 };

    consumeRateLimit("org_a", rule, 0);
    expect(() => consumeRateLimit("org_a", rule, 500)).toThrow(RateLimitError);
    expect(() => consumeRateLimit("org_a", rule, 1_500)).not.toThrow();
  });

  it("reports how long to wait", () => {
    resetRateLimits();
    const rule = { limit: 1, windowMs: 30_000 };
    consumeRateLimit("org_a", rule, 0);

    try {
      consumeRateLimit("org_a", rule, 10_000);
      throw new Error("expected a rate limit error");
    } catch (error) {
      expect(error).toBeInstanceOf(RateLimitError);
      expect((error as RateLimitError).retryAfterSeconds).toBe(20);
    }
  });
});
