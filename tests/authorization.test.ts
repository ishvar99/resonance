import { describe, expect, it } from "vitest";

import { accessibleVoiceFilter } from "@/features/voices/data/queries";

/**
 * Multi-tenancy is the security property this product lives or dies on.
 *
 * `accessibleVoiceFilter` is the single place the visibility rule is expressed,
 * so these tests assert on its shape directly. Rather than trusting the Prisma
 * where-clause by eye, `matches()` below evaluates it against candidate rows —
 * if the filter is ever loosened, these fail.
 */

type VoiceRow = {
  id: string;
  variant: "SYSTEM" | "CUSTOM";
  organizationId: string | null;
};

/** Evaluates the OR-of-AND filter this module produces against a row. */
function matches(filter: ReturnType<typeof accessibleVoiceFilter>, row: VoiceRow) {
  const clauses = filter.OR as Array<{
    variant: "SYSTEM" | "CUSTOM";
    organizationId: string | null;
  }>;

  return clauses.some(
    (clause) =>
      clause.variant === row.variant &&
      clause.organizationId === row.organizationId,
  );
}

const ORG_A = "org_aaaaaaaaaaaaaaaa";
const ORG_B = "org_bbbbbbbbbbbbbbbb";

const systemVoice: VoiceRow = {
  id: "system_aaron",
  variant: "SYSTEM",
  organizationId: null,
};
const orgAVoice: VoiceRow = {
  id: "voice_a",
  variant: "CUSTOM",
  organizationId: ORG_A,
};
const orgBVoice: VoiceRow = {
  id: "voice_b",
  variant: "CUSTOM",
  organizationId: ORG_B,
};

describe("voice visibility", () => {
  it("exposes system voices to every organization", () => {
    expect(matches(accessibleVoiceFilter(ORG_A), systemVoice)).toBe(true);
    expect(matches(accessibleVoiceFilter(ORG_B), systemVoice)).toBe(true);
  });

  it("exposes a custom voice to its owning organization", () => {
    expect(matches(accessibleVoiceFilter(ORG_A), orgAVoice)).toBe(true);
  });

  it("hides organization A's custom voice from organization B", () => {
    expect(matches(accessibleVoiceFilter(ORG_B), orgAVoice)).toBe(false);
    expect(matches(accessibleVoiceFilter(ORG_A), orgBVoice)).toBe(false);
  });

  it("never matches a custom voice with a null organization", () => {
    const orphan: VoiceRow = {
      id: "voice_orphan",
      variant: "CUSTOM",
      organizationId: null,
    };
    expect(matches(accessibleVoiceFilter(ORG_A), orphan)).toBe(false);
  });

  it("never matches a system voice that claims an organization", () => {
    // A SYSTEM row with an organizationId would be a data error; it must not
    // become readable to that organization by accident.
    const mislabelled: VoiceRow = {
      id: "voice_bad",
      variant: "SYSTEM",
      organizationId: ORG_A,
    };
    expect(matches(accessibleVoiceFilter(ORG_A), mislabelled)).toBe(false);
  });

  it("scopes the filter to exactly the organization it was built for", () => {
    const filter = accessibleVoiceFilter(ORG_A);
    const clauses = filter.OR as Array<{ organizationId: string | null }>;
    const organizationIds = clauses.map((clause) => clause.organizationId);

    expect(organizationIds).toContain(ORG_A);
    expect(organizationIds).not.toContain(ORG_B);
  });
});
