import { Skeleton } from "@/components/ui/skeleton";

/** Shown while a dashboard route's server data resolves. */
export default function DashboardLoading() {
  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-52 w-full rounded-xl" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-20 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
