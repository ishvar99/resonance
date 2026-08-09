import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { History as HistoryIcon } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/features/dashboard/components/page-header";
import { HistoryFilters } from "@/features/history/components/history-filters";
import { GenerationRow } from "@/features/history/components/generation-row";
import { listGenerations } from "@/features/text-to-speech/data/queries";
import { historyQuerySchema } from "@/features/text-to-speech/server/schemas";
import { requireAuthContext } from "@/lib/auth/context";

export const metadata: Metadata = {
  title: "History",
};

export default async function HistoryPage({
  searchParams,
}: PageProps<"/history">) {
  const { organizationId } = await requireAuthContext();
  const params = await searchParams;

  const parsed = historyQuerySchema.safeParse({
    cursor: firstValue(params.cursor),
    status: firstValue(params.status),
    search: firstValue(params.search),
  });
  const options = parsed.success ? parsed.data : {};

  const page = await listGenerations(organizationId, options);
  const hasFilters = Boolean(options.search || options.status);

  return (
    <>
      <PageHeader
        title="History"
        description="Every generation in this workspace"
      />

      <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
        <Suspense fallback={<Skeleton className="h-9 w-full" />}>
          <HistoryFilters />
        </Suspense>

        {page.items.length === 0 ? (
          <EmptyState
            icon={HistoryIcon}
            title={hasFilters ? "No generations match" : "No generations yet"}
            description={
              hasFilters
                ? "Try a different search term or clear the status filter."
                : "Generate speech and it will show up here with playback, downloads and the settings used."
            }
            action={
              hasFilters ? null : (
                <Button asChild>
                  <Link href="/text-to-speech">Generate speech</Link>
                </Button>
              )
            }
          />
        ) : (
          <>
            <Card className="overflow-hidden p-0">
              <ul>
                {page.items.map((generation) => (
                  <GenerationRow key={generation.id} generation={generation} />
                ))}
              </ul>
            </Card>

            {page.nextCursor ? (
              <div className="flex justify-center">
                <Button variant="outline" asChild>
                  <Link
                    href={buildHref({ ...options, cursor: page.nextCursor })}
                    scroll
                  >
                    Load older generations
                  </Link>
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

function buildHref(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `/history?${query}` : "/history";
}

function firstValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ? raw : undefined;
}
