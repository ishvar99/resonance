"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Download,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import WaveSurfer from "wavesurfer.js";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const SKIP_SECONDS = 10;

/**
 * Waveform player backed by Wavesurfer.
 *
 * Audio is fetched from `/api/audio/{id}`, which authorises the request and
 * supports range requests — so seeking does not pull the whole file down again.
 */
export function WaveformPlayer({
  source,
  downloadUrl,
  downloadName,
}: {
  source: string;
  downloadUrl?: string;
  downloadName?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const waveSurferRef = useRef<WaveSurfer | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Read the theme's colours so the waveform matches light/dark without
    // hardcoding hexes here.
    const styles = getComputedStyle(document.documentElement);
    const primary = styles.getPropertyValue("--primary").trim();
    const muted = styles.getPropertyValue("--muted-foreground").trim();

    const waveSurfer = WaveSurfer.create({
      container,
      height: 96,
      waveColor: muted ? `oklch(${muted} / 0.35)` : "#a1a1aa",
      progressColor: primary ? `oklch(${primary})` : "#6d28d9",
      cursorColor: primary ? `oklch(${primary})` : "#6d28d9",
      cursorWidth: 2,
      barWidth: 2,
      barGap: 2,
      barRadius: 4,
      normalize: true,
      url: source,
    });

    waveSurferRef.current = waveSurfer;

    const subscriptions = [
      waveSurfer.on("ready", () => {
        setIsReady(true);
        setDuration(waveSurfer.getDuration());
      }),
      waveSurfer.on("play", () => setIsPlaying(true)),
      waveSurfer.on("pause", () => setIsPlaying(false)),
      waveSurfer.on("finish", () => setIsPlaying(false)),
      waveSurfer.on("timeupdate", (time) => setCurrentTime(time)),
      waveSurfer.on("error", () => {
        setError("We could not load this audio. Try refreshing the page.");
        setIsReady(false);
      }),
    ];

    return () => {
      subscriptions.forEach((unsubscribe) => unsubscribe());
      waveSurfer.destroy();
      waveSurferRef.current = null;
    };
  }, [source]);

  const skip = useCallback((seconds: number) => {
    waveSurferRef.current?.skip(seconds);
  }, []);

  // Space toggles playback when focus is not in a field.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      if (event.code !== "Space") return;
      event.preventDefault();
      void waveSurferRef.current?.playPause();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="space-y-4">
      <div className="relative">
        <div
          ref={containerRef}
          className="w-full"
          role="img"
          aria-label="Audio waveform. Click to seek."
        />
        {!isReady && !error ? (
          <div className="text-muted-foreground absolute inset-0 flex items-center justify-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading waveform…
          </div>
        ) : null}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                disabled={!isReady}
                aria-label={`Skip back ${SKIP_SECONDS} seconds`}
                onClick={() => skip(-SKIP_SECONDS)}
              >
                <RotateCcw aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Back {SKIP_SECONDS}s</TooltipContent>
          </Tooltip>

          <Button
            size="icon-lg"
            className="rounded-full"
            disabled={!isReady}
            aria-label={isPlaying ? "Pause" : "Play"}
            onClick={() => void waveSurferRef.current?.playPause()}
          >
            {isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          </Button>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                disabled={!isReady}
                aria-label={`Skip forward ${SKIP_SECONDS} seconds`}
                onClick={() => skip(SKIP_SECONDS)}
              >
                <RotateCw aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Forward {SKIP_SECONDS}s</TooltipContent>
          </Tooltip>
        </div>

        <p
          className="text-muted-foreground font-mono text-sm tabular-nums"
          aria-live="off"
        >
          {formatTime(currentTime)} / {formatTime(duration)}
        </p>

        {downloadUrl ? (
          <Button variant="outline" size="sm" className="ml-auto" asChild>
            <a href={downloadUrl} download={downloadName}>
              <Download aria-hidden="true" />
              Download
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}
