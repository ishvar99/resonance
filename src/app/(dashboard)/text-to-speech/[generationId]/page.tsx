import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircle, ArrowLeft, Clock, Mic2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WaveformPlayer } from "@/features/audio/components/waveform-player";
import { PageHeader } from "@/features/dashboard/components/page-header";
import { GenerationStatusPoller } from "@/features/text-to-speech/components/generation-status-poller";
import { RegenerateButton } from "@/features/text-to-speech/components/regenerate-button";
import {
  findGeneration,
  toGenerationSummary,
} from "@/features/text-to-speech/data/queries";
import { requireAuthContext } from "@/lib/auth/context";
import { GENERATION_PARAMETERS } from "@/lib/chatterbox/types";

export const metadata: Metadata = {
  title: "Generation",
};

export default async function GenerationPage({
  params,
}: PageProps<"/text-to-speech/[generationId]">) {
  const { organizationId } = await requireAuthContext();
  const { generationId } = await params;

  // Scoped to the session's organization — another workspace's id 404s.
  const record = await findGeneration(organizationId, generationId);
  if (!record) notFound();

  const generation = toGenerationSummary(record);
  const audioUrl = `/api/audio/${generation.id}`;

  return (
    <>
      <PageHeader
        title={`Generated with ${generation.voiceName}`}
        description={new Date(generation.createdAt).toLocaleString()}
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/history">
                <ArrowLeft aria-hidden="true" />
                History
              </Link>
            </Button>
            <RegenerateButton
              generationId={generation.id}
              disabled={generation.voiceId === null}
            />
          </>
        }
      />

      <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
        {generation.status === "FAILED" ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>This generation failed</AlertTitle>
            <AlertDescription>
              {generation.errorMessage ??
                "The voice engine did not return audio. Try generating again."}
            </AlertDescription>
          </Alert>
        ) : null}

        {generation.status === "PENDING" || generation.status === "PROCESSING" ? (
          <>
            <GenerationStatusPoller />
            <Alert>
              <Clock aria-hidden="true" />
              <AlertTitle>
                {generation.status === "PENDING"
                  ? "Waiting in the queue"
                  : "Generating…"}
              </AlertTitle>
              <AlertDescription>
                {generation.status === "PENDING"
                  ? "A worker will pick this up shortly. This page updates by itself."
                  : "The voice engine is working on it. This page updates by itself."}
              </AlertDescription>
            </Alert>
          </>
        ) : null}

        {generation.hasAudio ? (
          <Card>
            <CardContent>
              <WaveformPlayer
                source={audioUrl}
                downloadUrl={`${audioUrl}?download=1`}
                downloadName={`${generation.voiceName}.wav`}
              />
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Script</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {generation.text}
            </p>
            <p className="text-muted-foreground mt-4 text-xs tabular-nums">
              {generation.characterCount.toLocaleString()} characters
              {generation.durationSecs
                ? ` · ${generation.durationSecs.toFixed(1)}s of audio`
                : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Settings used</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Mic2 className="text-muted-foreground size-4" aria-hidden="true" />
              <span className="text-sm font-medium">{generation.voiceName}</span>
              {generation.voiceId === null ? (
                <Badge variant="outline" className="text-[11px] font-normal">
                  Voice deleted
                </Badge>
              ) : null}
            </div>

            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Parameter
                label={GENERATION_PARAMETERS.temperature.label}
                value={generation.temperature.toFixed(2)}
              />
              <Parameter
                label={GENERATION_PARAMETERS.topP.label}
                value={generation.topP.toFixed(2)}
              />
              <Parameter
                label={GENERATION_PARAMETERS.topK.label}
                value={String(generation.topK)}
              />
              <Parameter
                label={GENERATION_PARAMETERS.repetitionPenalty.label}
                value={generation.repetitionPenalty.toFixed(2)}
              />
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Parameter({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-mono text-sm tabular-nums">{value}</dd>
    </div>
  );
}
