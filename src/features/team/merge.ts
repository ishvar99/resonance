/**
 * Joins Clerk's membership list with our per-creator generation aggregates
 * into the rows the Team page renders. Pure — inputs in, rows out — so the
 * classification rules below are directly testable.
 *
 * Classification:
 *  - every current member gets a row, active or not,
 *  - activity by a `createdBy` that is no longer a member stays visible as a
 *    "former member" row — usage history must not evaporate when someone
 *    leaves the workspace,
 *  - activity with `createdBy = null` came through the REST API (API keys are
 *    workspace credentials, not people) and is shown as one "API" row.
 */

export type TeamMemberInput = {
  userId: string;
  name: string;
  identifier: string;
  imageUrl: string | null;
  role: string;
};

export type MemberActivityInput = {
  createdBy: string | null;
  generations: number;
  characters: number;
  lastActiveAt: Date | null;
};

export type TeamActivityRow = {
  key: string;
  kind: "member" | "former" | "api";
  name: string;
  identifier: string | null;
  imageUrl: string | null;
  /** Clerk role for members, null otherwise. */
  role: string | null;
  generations: number;
  characters: number;
  lastActiveAt: string | null;
};

export function mergeMemberActivity(
  members: TeamMemberInput[],
  activity: MemberActivityInput[],
): TeamActivityRow[] {
  const byCreator = new Map(
    activity
      .filter((row) => row.createdBy !== null)
      .map((row) => [row.createdBy as string, row]),
  );

  const rows: TeamActivityRow[] = members.map((member) => {
    const entry = byCreator.get(member.userId);
    byCreator.delete(member.userId);

    return {
      key: member.userId,
      kind: "member",
      name: member.name,
      identifier: member.identifier,
      imageUrl: member.imageUrl,
      role: member.role,
      generations: entry?.generations ?? 0,
      characters: entry?.characters ?? 0,
      lastActiveAt: entry?.lastActiveAt?.toISOString() ?? null,
    };
  });

  // Whatever survives in the map generated audio here but is not a member now.
  for (const [creatorId, entry] of byCreator) {
    rows.push({
      key: creatorId,
      kind: "former",
      name: "Former member",
      identifier: null,
      imageUrl: null,
      role: null,
      generations: entry.generations,
      characters: entry.characters,
      lastActiveAt: entry.lastActiveAt?.toISOString() ?? null,
    });
  }

  const apiActivity = activity.find((row) => row.createdBy === null);
  if (apiActivity && apiActivity.generations > 0) {
    rows.push({
      key: "api",
      kind: "api",
      name: "API keys",
      identifier: null,
      imageUrl: null,
      role: null,
      generations: apiActivity.generations,
      characters: apiActivity.characters,
      lastActiveAt: apiActivity.lastActiveAt?.toISOString() ?? null,
    });
  }

  // Most active first; ties (typically the zero rows) alphabetically.
  return rows.sort(
    (a, b) => b.characters - a.characters || a.name.localeCompare(b.name),
  );
}

/** "org:admin" → "Admin"; unknown custom roles keep their slug, prettified. */
export function roleLabel(role: string | null): string | null {
  if (!role) return null;
  const slug = role.replace(/^org:/, "");
  return slug.charAt(0).toUpperCase() + slug.slice(1).replace(/[_-]+/g, " ");
}
