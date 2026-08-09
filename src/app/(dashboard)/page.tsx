import Link from "next/link";
import { ArrowRight, History as HistoryIcon, Sparkles } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WaveField } from "@/features/dashboard/components/wave-field";
import { PageHeader } from "@/features/dashboard/components/page-header";
import { QuickActions } from "@/features/dashboard/components/quick-actions";
import { greetingFor } from "@/features/dashboard/greeting";
import { GenerationRow } from "@/features/history/components/generation-row";
import { SpeechComposer } from "@/features/text-to-speech/components/speech-composer";
import { listGenerations } from "@/features/text-to-speech/data/queries";
import { countVoicesByVariant, listVoices } from "@/features/voices/data/queries";
import { getAuthContext, getViewerDisplayName } from "@/lib/auth/context";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const context = await getAuthContext();
  if (!context) redirect("/organization-selection");

  const [name, voices, counts, recent] = await Promise.all([
    getViewerDisplayName(),
    listVoices(context.organizationId),
    countVoicesByVariant(context.organizationId),
    listGenerations(context.organizationId, { take: 5 }),
  ]);

  return (
    <>
      <PageHeader title="Home" description="Your workspace at a glance" />

      <div className="relative">
        <WaveField className="pointer-events-none absolute inset-x-0 top-0 h-[420px]" />

        <div className="relative mx-auto w-full max-w-4xl space-y-8 p-4 sm:p-6">
          <header className="space-y-1 pt-4">
            <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              {greetingFor(name)}
            </h2>
            <p className="text-muted-foreground text-sm text-pretty">
              {counts.custom > 0
                ? `${counts.custom} custom ${counts.custom === 1 ? "voice" : "voices"} and ${counts.system} system voices are ready in this workspace.`
                : "Start by generating speech with a system voice, or clone one of your own."}
            </p>
          </header>

          {voices.length > 0 ? (
            <SpeechComposer voices={voices} variant="hero" />
          ) : (
            <EmptyState
              icon={Sparkles}
              title="No voices in this workspace yet"
              description="Seed the system voices with `npm run db:seed`, or clone your first voice from a recording."
              action={
                <Button asChild>
                  <Link href="/voices?create=1">Create a voice</Link>
                </Button>
              }
              className="bg-card"
            />
          )}

          <section aria-labelledby="quick-actions-heading" className="space-y-3">
            <h3
              id="quick-actions-heading"
              className="text-muted-foreground text-xs font-medium tracking-wide uppercase"
            >
              Quick actions
            </h3>
            <QuickActions />
          </section>

          <section aria-labelledby="recent-heading" className="space-y-3">
            <div className="flex items-center justify-between">
              <h3
                id="recent-heading"
                className="text-muted-foreground text-xs font-medium tracking-wide uppercase"
              >
                Recent generations
              </h3>
              {recent.items.length > 0 ? (
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/history">
                    View all
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              ) : null}
            </div>

            {recent.items.length === 0 ? (
              <EmptyState
                icon={HistoryIcon}
                title="Nothing generated yet"
                description="Your generations will appear here, with playback and downloads."
                className="bg-card py-10"
              />
            ) : (
              <Card className="overflow-hidden p-0">
                <ul>
                  {recent.items.map((generation) => (
                    <GenerationRow key={generation.id} generation={generation} />
                  ))}
                </ul>
              </Card>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
