import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/features/dashboard/components/app-sidebar";
import { setOrganizationScope } from "@/lib/observability";

/**
 * Every route in this group assumes an authenticated user *and* an active
 * organization.
 *
 * This is the real guarantee, not the proxy: the layout re-derives identity
 * from the session on the server and redirects before any child renders. It
 * distinguishes the two failure modes so a signed-out user is not bounced
 * through the workspace picker on the way to sign-in.
 */
export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const { userId, orgId } = await auth();

  if (!userId) redirect("/sign-in");
  if (!orgId) redirect("/organization-selection");

  // Tags every Sentry event raised while rendering this request.
  setOrganizationScope(orgId, userId);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0 overflow-x-hidden">{children}</SidebarInset>
    </SidebarProvider>
  );
}
