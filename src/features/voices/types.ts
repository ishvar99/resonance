import type { VoiceCategory, VoiceVariant } from "@/generated/prisma/enums";

/**
 * Serialisable voice shape handed to client components.
 *
 * Deliberately narrower than the Prisma model: `r2ObjectKey` never leaves the
 * server, because knowing an object key should not imply the ability to read it.
 */
export type VoiceSummary = {
  id: string;
  name: string;
  description: string | null;
  category: VoiceCategory;
  language: string;
  variant: VoiceVariant;
  /** Whether a reference sample exists, so the UI can disable preview. */
  hasSample: boolean;
  createdAt: string;
};
