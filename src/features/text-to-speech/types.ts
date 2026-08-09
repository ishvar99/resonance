import type { GenerationStatus } from "@/generated/prisma/enums";

/** Serialisable generation shape for client components. Never exposes object keys. */
export type GenerationSummary = {
  id: string;
  text: string;
  voiceId: string | null;
  voiceName: string;
  status: GenerationStatus;
  errorMessage: string | null;
  characterCount: number;
  durationSecs: number | null;
  temperature: number;
  topP: number;
  topK: number;
  repetitionPenalty: number;
  /** True once audio exists and `/api/audio/{id}` will serve it. */
  hasAudio: boolean;
  createdAt: string;
};
