"use client";

import { useRef, useState } from "react";
import { AlertCircle, FileAudio, UploadCloud, X } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  VOICE_SAMPLE_ACCEPTED_MIME_TYPES,
  VOICE_SAMPLE_MAX_BYTES,
  VOICE_SAMPLE_MIN_BYTES,
} from "@/features/voices/constants";
import { cn } from "@/lib/utils";

const ACCEPT = VOICE_SAMPLE_ACCEPTED_MIME_TYPES.join(",");

/**
 * Drag-and-drop / file-picker for a voice sample.
 *
 * Validation mirrors `voiceSampleSchema` so a bad file is rejected here rather
 * than after an upload — the server still re-validates, since this check runs
 * on the client and is therefore advisory.
 */
export function VoiceUploader({
  file,
  onFileChange,
  disabled,
}: {
  file: File | null;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function accept(candidate: File | undefined) {
    if (!candidate) return;

    const type = candidate.type.split(";")[0]!.trim().toLowerCase();
    if (!VOICE_SAMPLE_ACCEPTED_MIME_TYPES.includes(type as never)) {
      setError("Upload a WAV, MP3, M4A, FLAC, OGG or WebM audio file.");
      return;
    }
    if (candidate.size > VOICE_SAMPLE_MAX_BYTES) {
      setError(
        `That file is ${formatBytes(candidate.size)}. The limit is ${formatBytes(
          VOICE_SAMPLE_MAX_BYTES,
        )}.`,
      );
      return;
    }
    if (candidate.size < VOICE_SAMPLE_MIN_BYTES) {
      setError("That file is too small to clone a voice from.");
      return;
    }

    setError(null);
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(candidate);
    });
    onFileChange(candidate);
  }

  function clear() {
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
    setError(null);
    onFileChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-4">
      {file ? (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-start gap-3">
            <div className="bg-primary/10 text-primary rounded-md p-2">
              <FileAudio className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={file.name}>
                {file.name}
              </p>
              <p className="text-muted-foreground text-xs">
                {formatBytes(file.size)}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={clear}
              disabled={disabled}
              aria-label="Remove selected file"
            >
              <X aria-hidden="true" />
            </Button>
          </div>

          {previewUrl ? (
            <audio src={previewUrl} controls className="w-full" />
          ) : null}
        </div>
      ) : (
        <div
          className={cn(
            "rounded-lg border-2 border-dashed p-8 text-center transition-colors",
            isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25",
            disabled && "pointer-events-none opacity-60",
          )}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            accept(event.dataTransfer.files[0]);
          }}
        >
          <UploadCloud
            className="text-muted-foreground mx-auto size-8"
            aria-hidden="true"
          />
          <p className="mt-3 text-sm font-medium">
            Drag an audio file here
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            WAV, MP3, M4A, FLAC, OGG or WebM · up to{" "}
            {formatBytes(VOICE_SAMPLE_MAX_BYTES)}
          </p>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            Choose a file
          </Button>

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-label="Voice sample file"
            onChange={(event) => accept(event.target.files?.[0])}
          />
        </div>
      )}

      {error ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
