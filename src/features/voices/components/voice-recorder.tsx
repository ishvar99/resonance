"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Mic, RotateCcw, Square } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { VOICE_SAMPLE_RECOMMENDED_SECONDS } from "@/features/voices/constants";
import { cn } from "@/lib/utils";

const BAR_COUNT = 32;
/** Hard stop so a forgotten recording cannot grow unbounded. */
const MAX_RECORDING_SECONDS = 120;

type RecorderState = "idle" | "requesting" | "recording" | "recorded" | "denied";

/**
 * Browser microphone capture.
 *
 * Nothing leaves the browser here: the recording becomes an in-memory `File`
 * that the parent only uploads once the user submits the create form. Stopping
 * always releases the microphone track so the browser's recording indicator
 * clears.
 */
export function VoiceRecorder({
  onRecorded,
  disabled,
}: {
  onRecorded: (file: File | null) => void;
  disabled?: boolean;
}) {
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frameRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  // Bars are written to directly rather than through state — 60fps of React
  // re-renders for a level meter is not a good trade.
  const barsRef = useRef<Array<HTMLDivElement | null>>([]);

  const releaseHardware = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    void audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    analyserRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      releaseHardware();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [releaseHardware, previewUrl]);

  /**
   * Drives the level meter. The RAF loop is a plain local function so it can
   * schedule itself without the callback having to reference its own identity.
   */
  const startLevelMeter = useCallback(() => {
    const tick = () => {
      const analyser = analyserRef.current;
      if (!analyser) return;

      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);

      const step = Math.floor(data.length / BAR_COUNT) || 1;
      for (let index = 0; index < BAR_COUNT; index += 1) {
        const value = data[index * step] ?? 0;
        const bar = barsRef.current[index];
        if (bar) bar.style.transform = `scaleY(${Math.max(0.08, value / 255)})`;
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setState("requesting");

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("denied");
      setError("This browser does not support microphone recording. Upload a file instead.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch {
      setState("denied");
      setError(
        "Microphone access was blocked. Allow it in your browser settings, or upload a file instead.",
      );
      return;
    }

    streamRef.current = stream;

    // Live level meter.
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    });

    recorder.addEventListener("stop", () => {
      const type = recorder.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      const extension = type.includes("mp4") ? "m4a" : "webm";

      const file = new File([blob], `recording.${extension}`, { type });

      setPreviewUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return URL.createObjectURL(blob);
      });
      setState("recorded");
      releaseHardware();
      onRecorded(file);
    });

    recorder.start(250);
    setSeconds(0);
    setState("recording");
    startLevelMeter();

    intervalRef.current = setInterval(() => {
      setSeconds((value) => {
        if (value + 1 >= MAX_RECORDING_SECONDS) stopRecording();
        return value + 1;
      });
    }, 1000);
  }, [onRecorded, releaseHardware, startLevelMeter, stopRecording]);

  const reset = useCallback(() => {
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
    setSeconds(0);
    setState("idle");
    onRecorded(null);
  }, [onRecorded]);

  const tooShort =
    state === "recorded" && seconds < VOICE_SAMPLE_RECOMMENDED_SECONDS.min;

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "bg-muted/40 flex h-32 items-end justify-center gap-1 rounded-lg border p-4",
          state === "recording" && "border-primary/50",
        )}
        role="img"
        aria-label={
          state === "recording"
            ? `Recording, ${formatDuration(seconds)} elapsed`
            : "Microphone level meter"
        }
      >
        {Array.from({ length: BAR_COUNT }, (_, index) => (
          <div
            key={index}
            ref={(element) => {
              barsRef.current[index] = element;
            }}
            className={cn(
              "h-full w-1.5 origin-bottom rounded-full transition-colors",
              state === "recording" ? "bg-primary" : "bg-muted-foreground/25",
            )}
            style={{ transform: "scaleY(0.08)" }}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {state === "recording" ? (
          <>
            <Button type="button" variant="destructive" onClick={stopRecording}>
              <Square aria-hidden="true" />
              Stop recording
            </Button>
            <span
              className="text-muted-foreground text-sm tabular-nums"
              aria-live="off"
            >
              <span className="bg-destructive mr-2 inline-block size-2 animate-pulse rounded-full" />
              {formatDuration(seconds)} / {formatDuration(MAX_RECORDING_SECONDS)}
            </span>
          </>
        ) : state === "recorded" ? (
          <>
            <Button type="button" variant="outline" onClick={reset}>
              <RotateCcw aria-hidden="true" />
              Record again
            </Button>
            <span className="text-muted-foreground text-sm tabular-nums">
              {formatDuration(seconds)} recorded
            </span>
          </>
        ) : (
          <Button
            type="button"
            onClick={() => void startRecording()}
            disabled={disabled || state === "requesting"}
          >
            <Mic aria-hidden="true" />
            {state === "requesting" ? "Requesting access…" : "Start recording"}
          </Button>
        )}
      </div>

      {previewUrl ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs font-medium">
            Listen back before you continue
          </p>
          <audio src={previewUrl} controls className="w-full" />
        </div>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Microphone unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {tooShort ? (
        <Alert>
          <AlertCircle aria-hidden="true" />
          <AlertTitle>That was quite short</AlertTitle>
          <AlertDescription>
            {VOICE_SAMPLE_RECOMMENDED_SECONDS.min}–
            {VOICE_SAMPLE_RECOMMENDED_SECONDS.max} seconds of natural speech
            clones best. You can continue, but the result may be less faithful.
          </AlertDescription>
        </Alert>
      ) : null}

      {state === "idle" ? (
        <p className="text-muted-foreground text-center text-xs text-balance">
          Read a couple of sentences at your natural pace in a quiet room. Nothing
          is uploaded until you create the voice.
        </p>
      ) : null}
    </div>
  );
}

/** Picks the best container this browser can actually record. */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
