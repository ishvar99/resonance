import { describe, expect, it } from "vitest";

import {
  generateSpeechSchema,
  generationSettingsSchema,
} from "@/features/text-to-speech/server/schemas";
import {
  GENERATION_PARAMETERS,
  MAX_GENERATION_CHARACTERS,
} from "@/lib/chatterbox/types";

/**
 * These bounds are what stop an out-of-range value reaching the GPU service.
 * They must stay pinned to the real Chatterbox ranges.
 */

const validInput = {
  text: "Hello from Resonance.",
  voiceId: "voice_123",
  temperature: 0.8,
  topP: 0.95,
  topK: 1000,
  repetitionPenalty: 1.2,
};

describe("generation input validation", () => {
  it("accepts a well-formed request", () => {
    const result = generateSpeechSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("requires a voice", () => {
    const result = generateSpeechSchema.safeParse({ ...validInput, voiceId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects empty or whitespace-only text", () => {
    expect(generateSpeechSchema.safeParse({ ...validInput, text: "" }).success).toBe(
      false,
    );
    expect(
      generateSpeechSchema.safeParse({ ...validInput, text: "   " }).success,
    ).toBe(false);
  });

  it("trims text before length checks", () => {
    const result = generateSpeechSchema.safeParse({
      ...validInput,
      text: "  spaced  ",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.text).toBe("spaced");
  });

  it("enforces the character ceiling", () => {
    const tooLong = "a".repeat(MAX_GENERATION_CHARACTERS + 1);
    expect(
      generateSpeechSchema.safeParse({ ...validInput, text: tooLong }).success,
    ).toBe(false);

    const atLimit = "a".repeat(MAX_GENERATION_CHARACTERS);
    expect(
      generateSpeechSchema.safeParse({ ...validInput, text: atLimit }).success,
    ).toBe(true);
  });

  it("applies Chatterbox defaults when settings are omitted", () => {
    const result = generationSettingsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.temperature).toBe(0.8);
    expect(result.data.topP).toBe(0.95);
    expect(result.data.topK).toBe(1000);
    expect(result.data.repetitionPenalty).toBe(1.2);
  });

  it("rejects each parameter outside its documented range", () => {
    const outOfRange = [
      { temperature: GENERATION_PARAMETERS.temperature.max + 0.1 },
      { temperature: GENERATION_PARAMETERS.temperature.min - 0.1 },
      { topP: GENERATION_PARAMETERS.topP.max + 0.01 },
      { topP: GENERATION_PARAMETERS.topP.min - 0.01 },
      { topK: GENERATION_PARAMETERS.topK.max + 1 },
      { topK: GENERATION_PARAMETERS.topK.min - 1 },
      { repetitionPenalty: GENERATION_PARAMETERS.repetitionPenalty.max + 0.1 },
      { repetitionPenalty: GENERATION_PARAMETERS.repetitionPenalty.min - 0.1 },
    ];

    for (const override of outOfRange) {
      const result = generateSpeechSchema.safeParse({ ...validInput, ...override });
      expect(result.success, `expected rejection for ${JSON.stringify(override)}`).toBe(
        false,
      );
    }
  });

  it("requires topK to be an integer", () => {
    expect(
      generateSpeechSchema.safeParse({ ...validInput, topK: 500.5 }).success,
    ).toBe(false);
  });

  it("never accepts an organizationId from the client", () => {
    const result = generateSpeechSchema.safeParse({
      ...validInput,
      organizationId: "org_attacker",
    });

    expect(result.success).toBe(true);
    // Zod strips unknown keys, so a smuggled tenant id cannot reach the query.
    if (result.success) {
      expect(result.data).not.toHaveProperty("organizationId");
    }
  });
});
