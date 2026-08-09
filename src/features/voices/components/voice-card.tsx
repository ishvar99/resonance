"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AudioLines, MoreHorizontal, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PreviewButton } from "@/features/audio/components/preview-button";
import { voiceCategoryLabel, voiceLanguage } from "@/features/voices/constants";
import { deleteVoiceAction } from "@/features/voices/server/actions";
import type { VoiceSummary } from "@/features/voices/types";

export function VoiceCard({ voice }: { voice: VoiceSummary }) {
  const router = useRouter();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, startDelete] = useTransition();

  const language = voiceLanguage(voice.language);
  const isCustom = voice.variant === "CUSTOM";

  const handleDelete = () => {
    startDelete(async () => {
      const result = await deleteVoiceAction({ voiceId: voice.id });

      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      setConfirmingDelete(false);
      toast.success(`"${voice.name}" was deleted`, {
        description: "Existing generations that used it are kept in your history.",
      });
      router.refresh();
    });
  };

  return (
    <>
      <Card className="group hover:border-primary/40 relative flex flex-col gap-3 p-4 transition-colors">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <PreviewButton
              source={voice.hasSample ? `/api/voices/${voice.id}/sample` : null}
              label={`${voice.name} sample`}
            />
            <div className="min-w-0">
              <h3 className="truncate text-sm font-medium" title={voice.name}>
                {voice.name}
              </h3>
              <p className="text-muted-foreground truncate text-xs">
                <span aria-hidden="true">{language.flag}</span>{" "}
                <span>{language.label}</span>
              </p>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                aria-label={`Actions for ${voice.name}`}
              >
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onSelect={() => router.push(`/text-to-speech?voice=${voice.id}`)}
              >
                <AudioLines aria-hidden="true" />
                Generate with voice
              </DropdownMenuItem>
              {isCustom ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setConfirmingDelete(true)}
                  >
                    <Trash2 aria-hidden="true" />
                    Delete voice
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {voice.description ? (
          <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
            {voice.description}
          </p>
        ) : (
          <p className="text-muted-foreground/60 text-xs italic">No description</p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          <Badge variant="secondary" className="text-[11px] font-normal">
            {voiceCategoryLabel(voice.category)}
          </Badge>
          {isCustom ? (
            <Badge className="gap-1 text-[11px] font-normal">
              <Sparkles className="size-3" aria-hidden="true" />
              Custom
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[11px] font-normal">
              System
            </Badge>
          )}
        </div>
      </Card>

      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{voice.name}&rdquo;?</DialogTitle>
            <DialogDescription>
              The reference sample is removed permanently. Generations that used
              this voice stay in your history and keep the voice name.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={isDeleting}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting…" : "Delete voice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
