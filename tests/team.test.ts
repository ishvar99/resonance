import { describe, expect, it } from "vitest";

import {
  mergeMemberActivity,
  roleLabel,
  type MemberActivityInput,
  type TeamMemberInput,
} from "@/features/team/merge";

const member = (overrides: Partial<TeamMemberInput> = {}): TeamMemberInput => ({
  userId: "user_a",
  name: "Ada Lovelace",
  identifier: "ada@example.com",
  imageUrl: null,
  role: "org:admin",
  ...overrides,
});

const activity = (
  overrides: Partial<MemberActivityInput> = {},
): MemberActivityInput => ({
  createdBy: "user_a",
  generations: 4,
  characters: 1200,
  lastActiveAt: new Date("2026-08-10T12:00:00Z"),
  ...overrides,
});

describe("team activity merge", () => {
  it("gives every member a row, active or not", () => {
    const rows = mergeMemberActivity(
      [member(), member({ userId: "user_b", name: "Blaise", identifier: "b@x.com" })],
      [activity()],
    );

    expect(rows).toHaveLength(2);
    const idle = rows.find((r) => r.key === "user_b");
    expect(idle).toMatchObject({ kind: "member", generations: 0, characters: 0 });
    expect(idle!.lastActiveAt).toBeNull();
  });

  it("keeps a departed creator's usage visible as a former member", () => {
    const rows = mergeMemberActivity(
      [member()],
      [activity({ createdBy: "user_gone", generations: 9, characters: 9000 })],
    );

    const former = rows.find((r) => r.key === "user_gone");
    expect(former).toMatchObject({
      kind: "former",
      name: "Former member",
      role: null,
      characters: 9000,
    });
  });

  it("attributes null creators to the workspace's API keys", () => {
    const rows = mergeMemberActivity(
      [member()],
      [activity({ createdBy: null, generations: 3, characters: 500 })],
    );

    const api = rows.find((r) => r.kind === "api");
    expect(api).toMatchObject({ name: "API keys", role: null, characters: 500 });
  });

  it("omits the API row when keys have never been used", () => {
    const rows = mergeMemberActivity([member()], []);
    expect(rows.some((r) => r.kind === "api")).toBe(false);
  });

  it("sorts by characters, most active first", () => {
    const rows = mergeMemberActivity(
      [
        member({ userId: "user_small", name: "Small" }),
        member({ userId: "user_big", name: "Big" }),
      ],
      [
        activity({ createdBy: "user_small", characters: 10 }),
        activity({ createdBy: "user_big", characters: 99_999 }),
      ],
    );

    expect(rows.map((r) => r.key)).toEqual(["user_big", "user_small"]);
  });

  it("never invents activity: totals equal the sum of inputs", () => {
    const inputs = [
      activity({ createdBy: "user_a", characters: 100 }),
      activity({ createdBy: "user_gone", characters: 200 }),
      activity({ createdBy: null, characters: 300 }),
    ];
    const rows = mergeMemberActivity([member()], inputs);

    const total = rows.reduce((sum, row) => sum + row.characters, 0);
    expect(total).toBe(600);
  });
});

describe("role labels", () => {
  it("prettifies Clerk's role slugs", () => {
    expect(roleLabel("org:admin")).toBe("Admin");
    expect(roleLabel("org:member")).toBe("Member");
    expect(roleLabel("org:billing_manager")).toBe("Billing manager");
    expect(roleLabel(null)).toBeNull();
  });
});
