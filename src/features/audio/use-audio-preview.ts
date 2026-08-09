"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Single-source preview playback.
 *
 * A module-level registry stops the previously playing clip whenever a new one
 * starts, so clicking through a grid of voices never stacks up overlapping
 * audio.
 */
let activeStop: (() => void) | null = null;

export type PreviewState = "idle" | "loading" | "playing" | "error";

export function useAudioPreview(source: string | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<PreviewState>("idle");

  /*
   * The element is created and wired up here rather than lazily inside
   * `toggle`, so the hook owns one external object with a clear lifecycle:
   * built when `source` changes, torn down when it changes again or on unmount.
   */
  useEffect(() => {
    if (!source) {
      audioRef.current = null;
      return;
    }

    const audio = new Audio(source);
    audio.preload = "none";
    audioRef.current = audio;

    const onEnded = () => setState("idle");
    const onError = () => setState("error");
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.pause();
      audioRef.current = null;
      setState("idle");
    };
  }, [source]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setState("idle");
  }, []);

  // Release the global slot if this hook owned it.
  useEffect(() => {
    return () => {
      if (activeStop === stop) activeStop = null;
    };
  }, [stop]);

  const toggle = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (state === "playing") {
      stop();
      if (activeStop === stop) activeStop = null;
      return;
    }

    activeStop?.();
    activeStop = stop;

    setState("loading");
    try {
      await audio.play();
      setState("playing");
    } catch {
      // Autoplay rejection, or a 403/404 from the audio proxy.
      setState("error");
    }
  }, [state, stop]);

  return { state, toggle, stop };
}
