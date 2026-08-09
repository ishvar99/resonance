import type { ByteRange } from "@/lib/storage/types";

/**
 * Single-range `Range: bytes=…` parsing.
 *
 * Multi-range requests are deliberately unsupported — browsers only ever send
 * one range for media playback, and `null` makes the caller fall back to a 200
 * with the whole body, which is always valid.
 */
export type ParsedRange =
  | { kind: "none" }
  | { kind: "unsatisfiable" }
  | { kind: "range"; range: ByteRange & { end: number } };

export function parseRangeHeader(
  header: string | null,
  totalLength: number,
): ParsedRange {
  if (!header) return { kind: "none" };

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return { kind: "none" };

  const [, rawStart, rawEnd] = match;
  const lastIndex = totalLength - 1;

  // `bytes=-500` means "the final 500 bytes".
  if (rawStart === "") {
    if (rawEnd === "") return { kind: "none" };
    const suffixLength = Number(rawEnd);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return { kind: "unsatisfiable" };
    }
    const start = Math.max(0, totalLength - suffixLength);
    return { kind: "range", range: { start, end: lastIndex } };
  }

  const start = Number(rawStart);
  if (!Number.isFinite(start) || start > lastIndex) {
    return { kind: "unsatisfiable" };
  }

  const end = rawEnd === "" ? lastIndex : Math.min(Number(rawEnd), lastIndex);
  if (!Number.isFinite(end) || end < start) return { kind: "unsatisfiable" };

  return { kind: "range", range: { start, end } };
}
