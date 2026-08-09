import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchX, Sparkles } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/features/dashboard/components/page-header";
import { CreateVoiceDialog } from "@/features/voices/components/create-voice-dialog";
import { VoiceCard } from "@/features/voices/components/voice-card";
import { VoiceFilters } from "@/features/voices/components/voice-filters";
import { listVoices } from "@/features/voices/data/queries";
import { listVoicesSchema } from "@/features/voices/server/schemas";
import { requireAuthContext } from "@/lib/auth/context";

export const metadata: Metadata = {
  title: "Voices",
};

export default async function VoicesPage({
  searchParams,
}: PageProps<"/voices">) {
  const { organizationId } = await requireAuthContext();
  const params = await searchParams;

  // Unknown filter values are dropped rather than rejected — a stale bookmark
  // should show the full library, not an error page.
  const filters = listVoicesSchema.safeParse({
    search: firstValue(params.search),
    category: firstValue(params.category),
    variant: firstValue(params.variant),
  });

  const options = filters.success ? filters.data : {};
  const voices = await listVoices(organizationId, options);

  const hasFilters = Boolean(options.search || options.category || options.variant);

  return (
    <>
      <PageHeader
        title="Voices"
        description="System voices plus everything this workspace has cloned"
        actions={
          <Suspense fallback={<Skeleton className="h-8 w-32" />}>
            <CreateVoiceDialog />
          </Suspense>
        }
      />

      <div className="space-y-6 p-4 sm:p-6">
        <Suspense fallback={<Skeleton className="h-9 w-full" />}>
          <VoiceFilters resultCount={voices.length} />
        </Suspense>

        {voices.length === 0 ? (
          hasFilters ? (
            <EmptyState
              icon={SearchX}
              title="No voices match those filters"
              description="Try a different search term, or clear the filters to see the whole library."
            />
          ) : (
            <EmptyState
              icon={Sparkles}
              title="No voices yet"
              description="Seed the system voices with `npm run db:seed`, or clone your first custom voice from a recording or an audio file."
              action={
                <Suspense fallback={null}>
                  <CreateVoiceDialog triggerLabel="Create your first voice" />
                </Suspense>
              }
            />
          )
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {voices.map((voice) => (
              <li key={voice.id} className="flex">
                <div className="w-full">
                  <VoiceCard voice={voice} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function firstValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ? raw : undefined;
}
