import Link from "next/link";
import { AudioLines, History, Library, type LucideIcon, Mic } from "lucide-react";

import { Card } from "@/components/ui/card";

const ACTIONS: Array<{
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
}> = [
  {
    title: "Generate speech",
    description: "Turn a script into audio",
    href: "/text-to-speech",
    icon: AudioLines,
  },
  {
    title: "Create a voice",
    description: "Clone from a recording or file",
    href: "/voices?create=1",
    icon: Mic,
  },
  {
    title: "Browse voices",
    description: "System and workspace voices",
    href: "/voices",
    icon: Library,
  },
  {
    title: "View history",
    description: "Everything generated here",
    href: "/history",
    icon: History,
  },
];

export function QuickActions() {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {ACTIONS.map((action) => (
        <li key={action.href}>
          <Card className="hover:border-primary/50 hover:bg-accent/40 h-full p-0 transition-colors">
            {/* The whole card is the hit target, so the link wraps the content. */}
            <Link
              href={action.href}
              className="flex h-full items-start gap-3 rounded-[inherit] p-4"
            >
              <span className="bg-primary/10 text-primary rounded-md p-2">
                <action.icon className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{action.title}</span>
                <span className="text-muted-foreground block text-xs text-pretty">
                  {action.description}
                </span>
              </span>
            </Link>
          </Card>
        </li>
      ))}
    </ul>
  );
}
