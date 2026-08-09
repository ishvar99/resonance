import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

/**
 * Sticky top bar for dashboard pages. Holds the sidebar trigger (the only way
 * to open the drawer on mobile), the page title and any page-level actions.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="bg-background/80 sticky top-0 z-20 flex flex-col gap-3 border-b px-4 py-3 backdrop-blur-md sm:px-6 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-1 !h-5 md:hidden" />
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold tracking-tight">
            {title}
          </h1>
          {description ? (
            <p className="text-muted-foreground truncate text-xs">{description}</p>
          ) : null}
        </div>
      </div>

      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
