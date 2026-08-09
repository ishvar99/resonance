import { describe, expect, it } from "vitest";

import { evaluateEntitlement } from "@/lib/billing/mock";
import type { OrganizationEntitlement } from "@/lib/billing/types";

/**
 * Entitlement is checked before any GPU work, so getting this wrong either
 * gives away free inference or blocks paying customers.
 */

function entitlement(
  overrides: Partial<OrganizationEntitlement> = {},
): OrganizationEntitlement {
  return {
    active: true,
    tier: "free",
    planName: "Free",
    includedCharacters: 10_000,
    includedVoices: 3,
    usedCharacters: 0,
    usedVoices: 0,
    periodStart: new Date("2026-08-01T00:00:00Z"),
    periodEnd: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  };
}

describe("entitlement evaluation", () => {
  it("allows a request that fits inside the allowance", () => {
    const result = evaluateEntitlement(
      entitlement({ usedCharacters: 1_000 }),
      "CHARACTERS",
      500,
    );
    expect(result.allowed).toBe(true);
  });

  it("allows a request that exactly consumes the allowance", () => {
    const result = evaluateEntitlement(
      entitlement({ usedCharacters: 9_500 }),
      "CHARACTERS",
      500,
    );
    expect(result.allowed).toBe(true);
  });

  it("blocks a request that would exceed the character allowance", () => {
    const result = evaluateEntitlement(
      entitlement({ usedCharacters: 9_800 }),
      "CHARACTERS",
      500,
    );

    expect(result.allowed).toBe(false);
    if (result.allowed) throw new Error("unreachable");
    expect(result.reason).toBe("QUOTA_EXCEEDED");
    // The message tells the user how much is left, not just that they failed.
    expect(result.message).toContain("200");
  });

  it("blocks voice creation past the included count", () => {
    const result = evaluateEntitlement(
      entitlement({ usedVoices: 3 }),
      "VOICE_CREATION",
      1,
    );

    expect(result.allowed).toBe(false);
    if (result.allowed) throw new Error("unreachable");
    expect(result.reason).toBe("QUOTA_EXCEEDED");
  });

  it("treats a null allowance as unmetered", () => {
    const result = evaluateEntitlement(
      entitlement({
        tier: "scale",
        planName: "Scale",
        includedCharacters: null,
        usedCharacters: 5_000_000,
      }),
      "CHARACTERS",
      100_000,
    );
    expect(result.allowed).toBe(true);
  });

  it("blocks everything when the workspace has no active entitlement", () => {
    const result = evaluateEntitlement(
      entitlement({ active: false }),
      "CHARACTERS",
      1,
    );

    expect(result.allowed).toBe(false);
    if (result.allowed) throw new Error("unreachable");
    expect(result.reason).toBe("NO_SUBSCRIPTION");
  });

  it("meters characters and voices independently", () => {
    // Out of characters, but voices are untouched.
    const exhausted = entitlement({ usedCharacters: 10_000, usedVoices: 0 });

    expect(evaluateEntitlement(exhausted, "CHARACTERS", 1).allowed).toBe(false);
    expect(evaluateEntitlement(exhausted, "VOICE_CREATION", 1).allowed).toBe(true);
  });
});
