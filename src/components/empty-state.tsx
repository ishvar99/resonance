import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** Consistent empty state: icon, one line of what is missing, one action. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-16 text-center",
        className,
      )}
    >
      <div className="bg-muted text-muted-foreground rounded-full p-3">
        <Icon className="size-6" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-sm font-medium">{title}</h2>
      <p className="text-muted-foreground mt-1 max-w-sm text-sm text-pretty">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
