import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";

import { ForbiddenError, UnauthorizedError } from "@/lib/errors";

/**
 * The single source of truth for "who is asking".
 *
 * Organization identity is read from the Clerk session token and never from a
 * request body, query parameter or form field. Every organization-scoped query
 * in this codebase must filter on the `organizationId` returned here.
 */
export type AuthContext = {
  userId: string;
  organizationId: string;
  organizationRole: string | null;
  organizationSlug: string | null;
};

/** Authenticated user, but no active organization required. */
export async function requireUser(): Promise<{ userId: string }> {
  const { userId } = await auth();
  if (!userId) throw new UnauthorizedError();
  return { userId };
}

/**
 * Authenticated user **with** an active organization.
 * Throws instead of redirecting so it is usable from route handlers, server
 * actions and server components alike; layouts handle the redirect separately.
 */
export async function requireAuthContext(): Promise<AuthContext> {
  const session = await auth();

  if (!session.userId) throw new UnauthorizedError();

  if (!session.orgId) {
    throw new ForbiddenError(
      "Select a workspace before continuing.",
      { reason: "NO_ACTIVE_ORGANIZATION" },
    );
  }

  return {
    userId: session.userId,
    organizationId: session.orgId,
    organizationRole: session.orgRole ?? null,
    organizationSlug: session.orgSlug ?? null,
  };
}

/** Non-throwing variant used by layouts that redirect rather than error. */
export async function getAuthContext(): Promise<AuthContext | null> {
  const session = await auth();
  if (!session.userId || !session.orgId) return null;

  return {
    userId: session.userId,
    organizationId: session.orgId,
    organizationRole: session.orgRole ?? null,
    organizationSlug: session.orgSlug ?? null,
  };
}

/** Display name for greetings. Falls back gracefully when Clerk has no name set. */
export async function getViewerDisplayName(): Promise<string | null> {
  const user = await currentUser();
  if (!user) return null;

  return (
    user.firstName ??
    user.username ??
    user.primaryEmailAddress?.emailAddress.split("@")[0] ??
    null
  );
}
