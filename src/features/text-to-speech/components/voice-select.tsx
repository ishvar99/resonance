"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { voiceCategoryLabel, voiceLanguage } from "@/features/voices/constants";
import type { VoiceSummary } from "@/features/voices/types";
import { cn } from "@/lib/utils";

/**
 * Voice picker.
 *
 * The list is already scoped by the server to system voices plus this
 * workspace's own, so filtering in the command palette is purely a UX nicety.
 */
export function VoiceSelect({
  voices,
  value,
  onChange,
  disabled,
}: {
  voices: VoiceSummary[];
  value: string | null;
  onChange: (voiceId: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(
    () => voices.find((voice) => voice.id === value) ?? null,
    [voices, value],
  );

  const [custom, system] = useMemo(
    () => [
      voices.filter((voice) => voice.variant === "CUSTOM"),
      voices.filter((voice) => voice.variant === "SYSTEM"),
    ],
    [voices],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Select a voice"
          disabled={disabled || voices.length === 0}
          className="w-full justify-between sm:w-64"
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected ? (
              <>
                <span aria-hidden="true">
                  {voiceLanguage(selected.language).flag}
                </span>
                <span className="truncate">{selected.name}</span>
              </>
            ) : (
              <span className="text-muted-foreground">
                {voices.length === 0 ? "No voices available" : "Select a voice"}
              </span>
            )}
          </span>
          <ChevronsUpDown className="opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-[min(20rem,calc(100vw-2rem))] p-0"
      >
        <Command>
          <CommandInput placeholder="Search voices…" />
          <CommandList>
            <CommandEmpty>No voice found.</CommandEmpty>

            {custom.length > 0 ? (
              <CommandGroup heading="Workspace voices">
                {custom.map((voice) => (
                  <VoiceOption
                    key={voice.id}
                    voice={voice}
                    selected={voice.id === value}
                    onSelect={() => {
                      onChange(voice.id);
                      setOpen(false);
                    }}
                  />
                ))}
              </CommandGroup>
            ) : null}

            {system.length > 0 ? (
              <CommandGroup heading="System voices">
                {system.map((voice) => (
                  <VoiceOption
                    key={voice.id}
                    voice={voice}
                    selected={voice.id === value}
                    onSelect={() => {
                      onChange(voice.id);
                      setOpen(false);
                    }}
                  />
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function VoiceOption({
  voice,
  selected,
  onSelect,
}: {
  voice: VoiceSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const language = voiceLanguage(voice.language);

  return (
    <CommandItem
      value={`${voice.name} ${language.label} ${voiceCategoryLabel(voice.category)}`}
      onSelect={onSelect}
      className="gap-2"
    >
      <Check className={cn("size-4", selected ? "opacity-100" : "opacity-0")} />
      <span aria-hidden="true">{language.flag}</span>
      <span className="min-w-0 flex-1 truncate">{voice.name}</span>
      {voice.variant === "CUSTOM" ? (
        <Badge variant="secondary" className="gap-1 text-[10px]">
          <Sparkles className="size-2.5" aria-hidden="true" />
          Custom
        </Badge>
      ) : null}
    </CommandItem>
  );
}
