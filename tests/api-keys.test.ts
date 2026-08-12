import { describe, expect, it } from "vitest";

import {
  generateApiKeySecret,
  hashApiKeySecret,
  parseApiKeyFromHeaders,
} from "@/lib/auth/api-key";
import { publicGenerateSchema } from "@/features/text-to-speech/server/schemas";

/**
 * API keys are workspace-wide credentials; the properties tested here are the
 * ones a leak or a probe would exploit.
 */

describe("api key generation", () => {
  it("produces the documented format", () => {
    const { secret, prefix, last4 } = generateApiKeySecret();

    expect(secret).toMatch(/^rsn_[0-9a-f]{64}$/);
    expect(secret.startsWith(prefix)).toBe(true);
    expect(secret.endsWith(last4)).toBe(true);
    // The displayable fragments must be useless on their own.
    expect(prefix.length + last4.length).toBeLessThan(20);
  });

  it("never emits the same secret twice", () => {
    const secrets = new Set(
      Array.from({ length: 100 }, () => generateApiKeySecret().secret),
    );
    expect(secrets.size).toBe(100);
  });

  it("stores a digest that cannot be reversed into the secret", () => {
    const { secret, keyHash } = generateApiKeySecret();

    expect(keyHash).not.toContain(secret);
    expect(secret).not.toContain(keyHash);
    expect(keyHash).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
    // Deterministic, so lookup by digest works.
    expect(hashApiKeySecret(secret)).toBe(keyHash);
  });
});

describe("api key header parsing", () => {
  const KEY = "rsn_" + "a".repeat(64);

  it("reads a bearer token", () => {
    const headers = new Headers({ authorization: `Bearer ${KEY}` });
    expect(parseApiKeyFromHeaders(headers)).toBe(KEY);
  });

  it("reads the X-API-Key header", () => {
    const headers = new Headers({ "x-api-key": KEY });
    expect(parseApiKeyFromHeaders(headers)).toBe(KEY);
  });

  it("is case-insensitive about the Bearer scheme", () => {
    const headers = new Headers({ authorization: `bearer ${KEY}` });
    expect(parseApiKeyFromHeaders(headers)).toBe(KEY);
  });

  it("rejects tokens that are not Resonance keys", () => {
    // A Clerk JWT or random bearer token must not be treated as an API key.
    expect(
      parseApiKeyFromHeaders(new Headers({ authorization: "Bearer eyJhbGciOi" })),
    ).toBeNull();
    expect(
      parseApiKeyFromHeaders(new Headers({ "x-api-key": "sk_live_something" })),
    ).toBeNull();
    expect(parseApiKeyFromHeaders(new Headers())).toBeNull();
  });

  it("rejects a bare key in Authorization without a scheme", () => {
    expect(
      parseApiKeyFromHeaders(new Headers({ authorization: KEY })),
    ).toBeNull();
  });
});

describe("public generate schema", () => {
  it("maps snake_case onto the internal shape with model defaults", () => {
    const result = publicGenerateSchema.safeParse({
      text: "Hello world",
      voice_id: "voice_123",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data).toEqual({
      text: "Hello world",
      voiceId: "voice_123",
      temperature: 0.8,
      topP: 0.95,
      topK: 1000,
      repetitionPenalty: 1.2,
    });
  });

  it("honours explicit parameters", () => {
    const result = publicGenerateSchema.safeParse({
      text: "Hi",
      voice_id: "v",
      temperature: 1.5,
      top_p: 0.5,
      top_k: 250,
      repetition_penalty: 1.6,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.temperature).toBe(1.5);
    expect(result.data.topP).toBe(0.5);
    expect(result.data.topK).toBe(250);
    expect(result.data.repetitionPenalty).toBe(1.6);
  });

  it("enforces the same bounds as the dashboard", () => {
    for (const override of [
      { temperature: 2.1 },
      { top_p: 1.01 },
      { top_k: 0 },
      { top_k: 2001 },
      { repetition_penalty: 0.9 },
    ]) {
      const result = publicGenerateSchema.safeParse({
        text: "Hi",
        voice_id: "v",
        ...override,
      });
      expect(result.success, `expected rejection for ${JSON.stringify(override)}`).toBe(
        false,
      );
    }
  });

  it("strips a smuggled organization id", () => {
    const result = publicGenerateSchema.safeParse({
      text: "Hi",
      voice_id: "v",
      organization_id: "org_attacker",
      organizationId: "org_attacker",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).not.toHaveProperty("organization_id");
    expect(result.data).not.toHaveProperty("organizationId");
  });
});
