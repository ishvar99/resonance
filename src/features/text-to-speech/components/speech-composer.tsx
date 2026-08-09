"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AudioLines, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GenerationSettingsPopover } from "@/features/text-to-speech/components/generation-settings";
import { VoiceSelect } from "@/features/text-to-speech/components/voice-select";
import { generateSpeechAction } from "@/features/text-to-speech/server/actions";
import type { GenerationSettings } from "@/features/text-to-speech/server/schemas";
import type { VoiceSummary } from "@/features/voices/types";
import {
  DEFAULT_GENERATION_SETTINGS,
  MAX_GENERATION_CHARACTERS,
} from "@/lib/chatterbox/types";
import { cn } from "@/lib/utils";

/**
 * The generation surface. Shared by the home page and `/text-to-speech` so the
 * two never drift; `variant` only changes the chrome, not the behaviour.
 */
export function SpeechComposer({
  voices,
  initialVoiceId,
  initialText = "",
  variant = "page",
  className,
}: {
  voices: VoiceSummary[];
  initialVoiceId?: string | null;
  initialText?: string;
  variant?: "page" | "hero";
  className?: string;
}) {
  const router = useRouter();

  const [text, setText] = useState(initialText);
  const [voiceId, setVoiceId] = useState<string | null>(
    initialVoiceId ?? voices[0]?.id ?? null,
  );
  const [settings, setSettings] = useState<GenerationSettings>({
    ...DEFAULT_GENERATION_SETTINGS,
  });
  const [isGenerating, startGenerating] = useTransition();

  const trimmed = text.trim();
  const overLimit = text.length > MAX_GENERATION_CHARACTERS;
  const canGenerate = Boolean(trimmed) && Boolean(voiceId) && !overLimit;

  function handleGenerate() {
    if (!canGenerate || !voiceId) return;

    startGenerating(async () => {
      const result = await generateSpeechAction({
        text: trimmed,
        voiceId,
        ...settings,
      });

      if (!result.ok) {
        if (result.code === "BILLING_REQUIRED" && result.checkoutUrl) {
          const url = result.checkoutUrl;
          toast.error(result.message, {
            action: { label: "Upgrade", onClick: () => window.location.assign(url) },
            duration: 10_000,
          });
          return;
        }

        toast.error(result.message);
        return;
      }

      if (result.data.preview) {
        toast.warning("Development preview audio", {
          description:
            "Chatterbox is not configured, so this is placeholder audio rather than speech.",
        });
      } else {
        toast.success("Speech generated");
      }

      router.push(`/text-to-speech/${result.data.generationId}`);
    });
  }

  return (
    <Card
      className={cn(
        "gap-0 overflow-hidden p-0",
        variant === "hero" && "shadow-lg",
        className,
      )}
    >
      <div className="p-4 sm:p-5">
        <Label htmlFor="composer-text" className="sr-only">
          Text to convert to speech
        </Label>
        <Textarea
          id="composer-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Type or paste the words you want to hear…"
          rows={variant === "hero" ? 5 : 10}
          aria-invalid={overLimit}
          aria-describedby="composer-counter"
          className="resize-none border-0 p-0 !text-base shadow-none focus-visible:ring-0 md:!text-sm"
          onKeyDown={(event) => {
            // ⌘/Ctrl+Enter is the expected shortcut in a composer like this.
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              handleGenerate();
            }
          }}
        />
      </div>

      <div className="bg-muted/30 flex flex-col gap-3 border-t p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <VoiceSelect
            voices={voices}
            value={voiceId}
            onChange={setVoiceId}
            disabled={isGenerating}
          />
          <GenerationSettingsPopover
            settings={settings}
            onChange={setSettings}
            disabled={isGenerating}
          />
        </div>

        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <span
            id="composer-counter"
            className={cn(
              "text-xs tabular-nums",
              overLimit ? "text-destructive font-medium" : "text-muted-foreground",
            )}
          >
            {text.length.toLocaleString()} /{" "}
            {MAX_GENERATION_CHARACTERS.toLocaleString()}
          </span>

          <Button onClick={handleGenerate} disabled={!canGenerate || isGenerating}>
            {isGenerating ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Generating…
              </>
            ) : (
              <>
                {variant === "hero" ? (
                  <Sparkles aria-hidden="true" />
                ) : (
                  <AudioLines aria-hidden="true" />
                )}
                Generate speech
              </>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}
