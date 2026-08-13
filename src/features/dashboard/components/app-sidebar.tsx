"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import {
  AudioLines,
  History,
  type LucideIcon,
  Mic,
  Settings,
  Sparkles,
  Users,
  Waves,
} from "lucide-react";

import { ResonanceMark } from "@/components/brand/resonance-mark";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

type NavigationItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Match nested routes too (e.g. /text-to-speech/{id}). */
  matchNested?: boolean;
};

const WORKSPACE_LINKS: NavigationItem[] = [
  { title: "Home", href: "/", icon: Waves },
  { title: "Text to Speech", href: "/text-to-speech", icon: AudioLines, matchNested: true },
  { title: "Voices", href: "/voices", icon: Sparkles, matchNested: true },
  { title: "History", href: "/history", icon: History, matchNested: true },
  { title: "Team", href: "/team", icon: Users, matchNested: true },
];

const STUDIO_LINKS: NavigationItem[] = [
  { title: "Voice Cloning", href: "/voices?create=1", icon: Mic },
  { title: "Settings", href: "/settings", icon: Settings, matchNested: true },
];

function isActiveLink(pathname: string, item: NavigationItem): boolean {
  const [path] = item.href.split("?");
  if (path === "/") return pathname === "/";
  return item.matchNested ? pathname.startsWith(path!) : pathname === path;
}

export function AppSidebar() {
  const pathname = usePathname();
  const { state, isMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="gap-3">
        <Link
          href="/"
          className="flex h-8 items-center gap-2 rounded-md px-1 font-semibold tracking-tight"
        >
          <ResonanceMark className="text-primary size-6 shrink-0" />
          <span className="truncate text-[15px] group-data-[collapsible=icon]:hidden">
            Resonance
          </span>
        </Link>

        {/*
          Clerk renders its own trigger; the wrapper keeps it aligned with the
          nav and collapses it to just the avatar in icon mode.
        */}
        <div className="px-1 group-data-[collapsible=icon]:px-0">
          <OrganizationSwitcher
            hidePersonal
            afterSelectOrganizationUrl="/"
            afterCreateOrganizationUrl="/"
            appearance={{
              elements: {
                rootBox: "w-full",
                organizationSwitcherTrigger:
                  "w-full justify-between gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2 py-1.5 text-sm hover:bg-sidebar-accent " +
                  (collapsed ? "justify-center px-1" : ""),
                organizationPreviewTextContainer: collapsed ? "hidden" : "",
                organizationSwitcherTriggerIcon: collapsed ? "hidden" : "",
              },
            }}
          />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {WORKSPACE_LINKS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActiveLink(pathname, item)}
                    tooltip={item.title}
                  >
                    <Link href={item.href}>
                      <item.icon aria-hidden="true" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarGroupLabel>Studio</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {STUDIO_LINKS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActiveLink(pathname, item)}
                    tooltip={item.title}
                  >
                    <Link href={item.href}>
                      <item.icon aria-hidden="true" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center gap-2 px-1 py-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <UserButton
            appearance={{ elements: { userButtonAvatarBox: "size-7" } }}
            showName={!collapsed}
          />
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
