/**
 * Object key layout.
 *
 *   organizations/{organizationId}/voices/{voiceId}/source.{ext}
 *   organizations/{organizationId}/generations/{generationId}.wav
 *   system/voices/{voiceId}/source.wav
 *
 * Keys are derived, never accepted from the client — the organization segment is
 * a second line of defence behind the database ownership check.
 */

const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

function assertSafeSegment(value: string, label: string): string {
  if (!SAFE_SEGMENT.test(value)) {
    throw new Error(`Unsafe ${label} used in an object key: ${JSON.stringify(value)}`);
  }
  return value;
}

export function organizationVoiceSourceKey(
  organizationId: string,
  voiceId: string,
  extension = "wav",
): string {
  assertSafeSegment(organizationId, "organizationId");
  assertSafeSegment(voiceId, "voiceId");
  assertSafeSegment(extension, "extension");
  return `organizations/${organizationId}/voices/${voiceId}/source.${extension}`;
}

export function systemVoiceSourceKey(voiceId: string, extension = "wav"): string {
  assertSafeSegment(voiceId, "voiceId");
  assertSafeSegment(extension, "extension");
  return `system/voices/${voiceId}/source.${extension}`;
}

export function generationAudioKey(
  organizationId: string,
  generationId: string,
): string {
  assertSafeSegment(organizationId, "organizationId");
  assertSafeSegment(generationId, "generationId");
  return `organizations/${organizationId}/generations/${generationId}.wav`;
}

/** Extension for a supported upload mime type, defaulting to `wav`. */
export function extensionForAudioMimeType(mimeType: string): string {
  const normalized = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  switch (normalized) {
    case "audio/wav":
    case "audio/wave":
    case "audio/x-wav":
      return "wav";
    case "audio/mpeg":
    case "audio/mp3":
      return "mp3";
    case "audio/mp4":
    case "audio/m4a":
    case "audio/x-m4a":
      return "m4a";
    case "audio/ogg":
      return "ogg";
    case "audio/webm":
      return "webm";
    case "audio/flac":
    case "audio/x-flac":
      return "flac";
    default:
      return "wav";
  }
}
