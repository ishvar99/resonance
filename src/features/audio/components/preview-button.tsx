"use client";

import { Loader2, Pause, Play, VolumeX } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAudioPreview } from "@/features/audio/use-audio-preview";
import { cn } from "@/lib/utils";

/**
 * Icon-only play/pause control for previewing a sample.
 * `label` names what is being played — the button itself carries no text.
 */
export function PreviewButton({
  source,
  label,
  className,
  size = "icon",
}: {
  source: string | null;
  label: string;
  className?: string;
  size?: "icon" | "icon-sm" | "icon-lg";
}) {
  const { state, toggle } = useAudioPreview(source);
  const unavailable = !source;

  const { icon, description } = describe(state, unavailable, label);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size={size}
          className={cn("rounded-full", className)}
          disabled={unavailable}
          aria-label={description}
          onClick={() => void toggle()}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{description}</TooltipContent>
    </Tooltip>
  );
}

function describe(
  state: ReturnType<typeof useAudioPreview>["state"],
  unavailable: boolean,
  label: string,
) {
  if (unavailable) {
    return {
      icon: <VolumeX aria-hidden="true" />,
      description: `No preview available for ${label}`,
    };
  }
  if (state === "loading") {
    return {
      icon: <Loader2 className="animate-spin" aria-hidden="true" />,
      description: `Loading ${label}`,
    };
  }
  if (state === "playing") {
    return {
      icon: <Pause aria-hidden="true" />,
      description: `Pause ${label}`,
    };
  }
  if (state === "error") {
    return {
      icon: <VolumeX aria-hidden="true" />,
      description: `Preview unavailable for ${label}`,
    };
  }
  return {
    icon: <Play aria-hidden="true" />,
    description: `Play ${label}`,
  };
}
