import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/features/dashboard/components/page-header";
import { SpeechComposer } from "@/features/text-to-speech/components/speech-composer";
import { listVoices } from "@/features/voices/data/queries";
import { requireAuthContext } from "@/lib/auth/context";

export const metadata: Metadata = {
  title: "Text to Speech",
};

export default async function TextToSpeechPage({
  searchParams,
}: PageProps<"/text-to-speech">) {
  const { organizationId } = await requireAuthContext();
  const params = await searchParams;

  const voices = await listVoices(organizationId);

  // `?voice=` comes from the voices page's "Generate with voice" action. It is
  // only ever used to preselect from the already-authorised list.
  const requestedVoice =
    typeof params.voice === "string" ? params.voice : undefined;
  const initialVoiceId =
    voices.find((voice) => voice.id === requestedVoice)?.id ?? null;

  return (
    <>
      <PageHeader
        title="Text to Speech"
        description="Turn a script into speech with any voice in this workspace"
      />

      <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
        {voices.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="No voices available yet"
            description="Add a voice before generating speech. Seed the system voices with `npm run db:seed`, or clone one from a recording."
            action={
              <Button asChild>
                <Link href="/voices">Go to voices</Link>
              </Button>
            }
          />
        ) : (
          <SpeechComposer voices={voices} initialVoiceId={initialVoiceId} />
        )}
      </div>
    </>
  );
}
