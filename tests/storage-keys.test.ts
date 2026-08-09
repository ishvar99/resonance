import { describe, expect, it } from "vitest";

import {
  extensionForAudioMimeType,
  generationAudioKey,
  organizationVoiceSourceKey,
  systemVoiceSourceKey,
} from "@/lib/storage/keys";
import { parseRangeHeader } from "@/lib/audio/range";

const ORG = "org_2abcDEF123";
const VOICE = "voice_xyz789";
const GENERATION = "gen_abc123";

describe("object keys", () => {
  it("namespaces voice samples under the owning organization", () => {
    expect(organizationVoiceSourceKey(ORG, VOICE)).toBe(
      `organizations/${ORG}/voices/${VOICE}/source.wav`,
    );
  });

  it("namespaces generations under the owning organization", () => {
    expect(generationAudioKey(ORG, GENERATION)).toBe(
      `organizations/${ORG}/generations/${GENERATION}.wav`,
    );
  });

  it("puts system voices outside any organization prefix", () => {
    expect(systemVoiceSourceKey("system_aaron")).toBe(
      "system/voices/system_aaron/source.wav",
    );
  });

  it("refuses path traversal in any segment", () => {
    // Keys are derived server-side, but the guard is what makes that a
    // guarantee rather than a convention.
    expect(() => organizationVoiceSourceKey("../../etc", VOICE)).toThrow();
    expect(() => organizationVoiceSourceKey(ORG, "../other-org")).toThrow();
    expect(() => generationAudioKey(ORG, "a/b")).toThrow();
    expect(() => generationAudioKey("", GENERATION)).toThrow();
  });

  it("maps upload mime types to sane extensions", () => {
    expect(extensionForAudioMimeType("audio/wav")).toBe("wav");
    expect(extensionForAudioMimeType("audio/mpeg")).toBe("mp3");
    expect(extensionForAudioMimeType("audio/webm;codecs=opus")).toBe("webm");
    expect(extensionForAudioMimeType("audio/x-m4a")).toBe("m4a");
    // Unknown types fall back rather than producing an arbitrary extension.
    expect(extensionForAudioMimeType("application/octet-stream")).toBe("wav");
  });
});

describe("range header parsing", () => {
  const TOTAL = 1000;

  it("returns none without a header", () => {
    expect(parseRangeHeader(null, TOTAL)).toEqual({ kind: "none" });
  });

  it("parses a closed range", () => {
    expect(parseRangeHeader("bytes=0-499", TOTAL)).toEqual({
      kind: "range",
      range: { start: 0, end: 499 },
    });
  });

  it("parses an open-ended range", () => {
    expect(parseRangeHeader("bytes=500-", TOTAL)).toEqual({
      kind: "range",
      range: { start: 500, end: 999 },
    });
  });

  it("parses a suffix range", () => {
    expect(parseRangeHeader("bytes=-200", TOTAL)).toEqual({
      kind: "range",
      range: { start: 800, end: 999 },
    });
  });

  it("clamps an end past the object size", () => {
    expect(parseRangeHeader("bytes=900-5000", TOTAL)).toEqual({
      kind: "range",
      range: { start: 900, end: 999 },
    });
  });

  it("rejects a start past the object size", () => {
    expect(parseRangeHeader("bytes=1000-", TOTAL)).toEqual({
      kind: "unsatisfiable",
    });
  });

  it("rejects an inverted range", () => {
    expect(parseRangeHeader("bytes=500-100", TOTAL)).toEqual({
      kind: "unsatisfiable",
    });
  });

  it("ignores multi-range and malformed headers rather than failing", () => {
    // Falling back to a 200 with the full body is always a valid response.
    expect(parseRangeHeader("bytes=0-99,200-299", TOTAL)).toEqual({ kind: "none" });
    expect(parseRangeHeader("items=0-99", TOTAL)).toEqual({ kind: "none" });
  });
});
