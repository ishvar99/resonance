import "server-only";

import { clerkClient } from "@clerk/nextjs/server";

import {
  mergeMemberActivity,
  type MemberActivityInput,
  type TeamActivityRow,
  type TeamMemberInput,
} from "@/features/team/merge";
import { database } from "@/lib/database";

/**
 * Covers workspaces well past the free tier; a workspace with more than this
 * many members gets its first page here and full management in the embedded
 * Clerk panel, which paginates natively.
 */
const MEMBER_PAGE_LIMIT = 100;

async function listMembers(organizationId: string): Promise<TeamMemberInput[]> {
  const client = await clerkClient();
  const memberships = await client.organizations.getOrganizationMembershipList({
    organizationId,
    limit: MEMBER_PAGE_LIMIT,
  });

  return memberships.data.flatMap((membership) => {
    const user = membership.publicUserData;
    if (!user) return []; // membership mid-provisioning — nothing to render yet

    const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
    return [
      {
        userId: user.userId,
        name: fullName || user.identifier,
        identifier: user.identifier,
        imageUrl: user.hasImage ? user.imageUrl : null,
        role: membership.role,
      },
    ];
  });
}

async function getGenerationActivity(
  organizationId: string,
): Promise<MemberActivityInput[]> {
  const rows = await database.generation.groupBy({
    by: ["createdBy"],
    where: { organizationId },
    _count: { _all: true },
    _sum: { characterCount: true },
    _max: { createdAt: true },
  });

  return rows.map((row) => ({
    createdBy: row.createdBy,
    generations: row._count._all,
    characters: row._sum.characterCount ?? 0,
    lastActiveAt: row._max.createdAt,
  }));
}

/** The Team page's data: members joined with their generation activity. */
export async function getTeamActivity(
  organizationId: string,
): Promise<TeamActivityRow[]> {
  const [members, activity] = await Promise.all([
    listMembers(organizationId),
    getGenerationActivity(organizationId),
  ]);

  return mergeMemberActivity(members, activity);
}
