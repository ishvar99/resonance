import type { Metadata } from "next";
import { OrganizationList } from "@clerk/nextjs";

import { AuthShell } from "@/features/auth/components/auth-shell";

export const metadata: Metadata = {
  title: "Choose a workspace",
};

/**
 * Every voice, generation and invoice belongs to an organization, so a session
 * without an active organization cannot reach the dashboard at all. The proxy
 * redirects here; Clerk's `OrganizationList` both switches and creates.
 */
export default async function OrganizationSelectionPage({
  searchParams,
}: PageProps<"/organization-selection">) {
  const params = await searchParams;
  const requested = typeof params.redirect_url === "string" ? params.redirect_url : null;

  // Only ever bounce back to an in-app path — never to an attacker-supplied host.
  const afterSelect =
    requested && requested.startsWith("/") && !requested.startsWith("//")
      ? requested
      : "/";

  return (
    <AuthShell
      title="Choose a workspace"
      subtitle="Voices, generations and billing are scoped to a workspace. Pick one to continue or create a new one."
    >
      <OrganizationList
        hidePersonal
        skipInvitationScreen
        afterSelectOrganizationUrl={afterSelect}
        afterCreateOrganizationUrl={afterSelect}
        appearance={{ elements: { rootBox: "w-full", cardBox: "w-full shadow-none" } }}
      />
    </AuthShell>
  );
}
