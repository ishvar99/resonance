import type { VoiceCategory } from "@/generated/prisma/enums";

/**
 * Voice taxonomy shared by the server schemas, the filters and the create
 * dialog. Imported by client components, so nothing server-only belongs here.
 */

export const VOICE_CATEGORIES = [
  { value: "GENERAL", label: "General" },
  { value: "CONVERSATIONAL", label: "Conversational" },
  { value: "NARRATIVE", label: "Narrative" },
  { value: "AUDIOBOOK", label: "Audiobook" },
  { value: "PODCAST", label: "Podcast" },
  { value: "CHARACTERS", label: "Characters" },
  { value: "CUSTOMER_SERVICE", label: "Customer service" },
  { value: "CORPORATE", label: "Corporate" },
  { value: "ADVERTISING", label: "Advertising" },
  { value: "VOICE_OVER", label: "Voice over" },
  { value: "MEDITATION", label: "Meditation" },
  { value: "MOTIVATIONAL", label: "Motivational" },
] as const satisfies ReadonlyArray<{ value: VoiceCategory; label: string }>;

export const VOICE_CATEGORY_VALUES = VOICE_CATEGORIES.map((c) => c.value);

export function voiceCategoryLabel(category: VoiceCategory): string {
  return VOICE_CATEGORIES.find((c) => c.value === category)?.label ?? "General";
}

export const VOICE_LANGUAGES = [
  { value: "en-US", label: "English (US)", flag: "🇺🇸" },
  { value: "en-GB", label: "English (UK)", flag: "🇬🇧" },
  { value: "en-AU", label: "English (AU)", flag: "🇦🇺" },
  { value: "es-ES", label: "Spanish (Spain)", flag: "🇪🇸" },
  { value: "es-MX", label: "Spanish (Mexico)", flag: "🇲🇽" },
  { value: "fr-FR", label: "French", flag: "🇫🇷" },
  { value: "de-DE", label: "German", flag: "🇩🇪" },
  { value: "it-IT", label: "Italian", flag: "🇮🇹" },
  { value: "pt-BR", label: "Portuguese (Brazil)", flag: "🇧🇷" },
  { value: "nl-NL", label: "Dutch", flag: "🇳🇱" },
  { value: "pl-PL", label: "Polish", flag: "🇵🇱" },
  { value: "sv-SE", label: "Swedish", flag: "🇸🇪" },
  { value: "tr-TR", label: "Turkish", flag: "🇹🇷" },
  { value: "ru-RU", label: "Russian", flag: "🇷🇺" },
  { value: "ar-SA", label: "Arabic", flag: "🇸🇦" },
  { value: "hi-IN", label: "Hindi", flag: "🇮🇳" },
  { value: "ja-JP", label: "Japanese", flag: "🇯🇵" },
  { value: "ko-KR", label: "Korean", flag: "🇰🇷" },
  { value: "zh-CN", label: "Chinese (Mandarin)", flag: "🇨🇳" },
] as const;

export const VOICE_LANGUAGE_VALUES = VOICE_LANGUAGES.map((l) => l.value);

export function voiceLanguage(code: string) {
  return (
    VOICE_LANGUAGES.find((language) => language.value === code) ?? {
      value: code,
      label: code,
      flag: "🏳️",
    }
  );
}

/** Upload constraints, enforced again on the server. */
export const VOICE_SAMPLE_MAX_BYTES = 25 * 1024 * 1024;
export const VOICE_SAMPLE_MIN_BYTES = 2 * 1024;

export const VOICE_SAMPLE_ACCEPTED_MIME_TYPES = [
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/ogg",
  "audio/webm",
  "audio/flac",
  "audio/x-flac",
] as const;

/** Chatterbox conditions best on roughly 7–20 seconds of clean speech. */
export const VOICE_SAMPLE_RECOMMENDED_SECONDS = { min: 7, max: 30 } as const;
