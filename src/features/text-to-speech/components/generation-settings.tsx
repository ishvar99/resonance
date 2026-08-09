"use client";

import { RotateCcw, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { GenerationSettings } from "@/features/text-to-speech/server/schemas";
import {
  DEFAULT_GENERATION_SETTINGS,
  GENERATION_PARAMETERS,
  type GenerationParameterKey,
} from "@/lib/chatterbox/types";

const ORDER: GenerationParameterKey[] = [
  "temperature",
  "topP",
  "topK",
  "repetitionPenalty",
];

/**
 * The four Chatterbox inference parameters, surfaced with plain-English labels.
 * Bounds come from `GENERATION_PARAMETERS`, the same source the server schema
 * validates against — these controls are wired straight through to the model.
 */
export function GenerationSettingsPopover({
  settings,
  onChange,
  disabled,
}: {
  settings: GenerationSettings;
  onChange: (settings: GenerationSettings) => void;
  disabled?: boolean;
}) {
  const isDefault = ORDER.every(
    (key) => settings[key] === DEFAULT_GENERATION_SETTINGS[key],
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <SlidersHorizontal aria-hidden="true" />
          Settings
          {!isDefault ? (
            <span
              className="bg-primary ml-1 size-1.5 rounded-full"
              aria-label="Modified from defaults"
            />
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))]">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Generation settings</h3>
          <Button
            variant="ghost"
            size="sm"
            disabled={isDefault}
            onClick={() => onChange({ ...DEFAULT_GENERATION_SETTINGS })}
          >
            <RotateCcw aria-hidden="true" />
            Reset
          </Button>
        </div>

        <div className="mt-4 space-y-5">
          {ORDER.map((key) => (
            <ParameterSlider
              key={key}
              parameterKey={key}
              value={settings[key]}
              onValueChange={(value) => onChange({ ...settings, [key]: value })}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ParameterSlider({
  parameterKey,
  value,
  onValueChange,
}: {
  parameterKey: GenerationParameterKey;
  value: number;
  onValueChange: (value: number) => void;
}) {
  const spec = GENERATION_PARAMETERS[parameterKey];
  const id = `parameter-${parameterKey}`;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Label htmlFor={id} className="cursor-help text-xs font-medium">
              {spec.label}
            </Label>
          </TooltipTrigger>
          <TooltipContent>{spec.description}</TooltipContent>
        </Tooltip>
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {formatValue(parameterKey, value)}
        </span>
      </div>

      <Slider
        id={id}
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={[value]}
        aria-label={spec.label}
        aria-valuetext={`${formatValue(parameterKey, value)} — ${spec.lowLabel} to ${spec.highLabel}`}
        onValueChange={([next]) => {
          if (next !== undefined) onValueChange(next);
        }}
      />

      <div className="text-muted-foreground flex justify-between text-[11px]">
        <span>{spec.lowLabel}</span>
        <span>{spec.highLabel}</span>
      </div>
    </div>
  );
}

function formatValue(key: GenerationParameterKey, value: number): string {
  return key === "topK" ? String(Math.round(value)) : value.toFixed(2);
}
