import Link from "next/link";
import { AlertCircle, ChevronRight, Clock, Download, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PreviewButton } from "@/features/audio/components/preview-button";
import type { GenerationSummary } from "@/features/text-to-speech/types";

/** One row in the history list. Server component — only the player is client. */
export function GenerationRow({ generation }: { generation: GenerationSummary }) {
  const created = new Date(generation.createdAt);

  return (
    <li className="hover:bg-accent/40 flex items-center gap-3 border-b px-3 py-3 transition-colors last:border-b-0 sm:px-4">
      <PreviewButton
        source={generation.hasAudio ? `/api/audio/${generation.id}` : null}
        label={`generation with ${generation.voiceName}`}
        size="icon-sm"
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-medium">
            {generation.voiceName}
          </span>
          <StatusBadge generation={generation} />
        </div>
        <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
          {generation.text}
        </p>
      </div>

      <div className="text-muted-foreground hidden shrink-0 text-right text-xs tabular-nums sm:block">
        <p>{created.toLocaleDateString()}</p>
        <p>
          {created.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          {" · "}
          {generation.characterCount.toLocaleString()} chars
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {generation.hasAudio ? (
          <Button variant="ghost" size="icon-sm" asChild>
            <a
              href={`/api/audio/${generation.id}?download=1`}
              download
              aria-label={`Download generation with ${generation.voiceName}`}
            >
              <Download aria-hidden="true" />
            </a>
          </Button>
        ) : null}

        <Button variant="ghost" size="icon-sm" asChild>
          <Link
            href={`/text-to-speech/${generation.id}`}
            aria-label={`Open generation with ${generation.voiceName}`}
          >
            <ChevronRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </li>
  );
}

function StatusBadge({ generation }: { generation: GenerationSummary }) {
  if (generation.status === "COMPLETED") return null;

  if (generation.status === "PENDING") {
    return (
      <Badge variant="secondary" className="gap-1 text-[11px] font-normal">
        <Clock className="size-3" aria-hidden="true" />
        Queued
      </Badge>
    );
  }

  if (generation.status === "PROCESSING") {
    return (
      <Badge variant="secondary" className="gap-1 text-[11px] font-normal">
        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
        Generating
      </Badge>
    );
  }

  return (
    <Badge variant="destructive" className="gap-1 text-[11px] font-normal">
      <AlertCircle className="size-3" aria-hidden="true" />
      Failed
    </Badge>
  );
}
