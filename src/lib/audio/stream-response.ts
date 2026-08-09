import "server-only";

import { parseRangeHeader } from "@/lib/audio/range";
import { NotFoundError } from "@/lib/errors";
import { getStorage } from "@/lib/storage";

/**
 * Streams a stored object back to the browser with range support, so `<audio>`
 * and Wavesurfer can seek without downloading the whole file.
 *
 * Callers MUST have already verified that the requester may read `key` — this
 * helper performs no authorization of its own.
 */
export async function streamStoredAudio(options: {
  key: string;
  request: Request;
  /** Suggested filename; when set the response is served as an attachment. */
  downloadFilename?: string;
  /** Cache-Control for a private, per-tenant resource. */
  cacheControl?: string;
}): Promise<Response> {
  const storage = getStorage();
  const metadata = await storage.head(options.key);
  if (!metadata) {
    throw new NotFoundError("That audio file is no longer available.");
  }

  const totalLength = metadata.contentLength;
  const parsed = parseRangeHeader(options.request.headers.get("range"), totalLength);

  const baseHeaders: Record<string, string> = {
    "Content-Type": metadata.contentType,
    "Accept-Ranges": "bytes",
    // Private: this URL is tenant-scoped and must never be shared by a CDN.
    "Cache-Control": options.cacheControl ?? "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  };

  if (options.downloadFilename) {
    baseHeaders["Content-Disposition"] =
      `attachment; filename="${sanitizeFilename(options.downloadFilename)}"`;
  }

  if (parsed.kind === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: { ...baseHeaders, "Content-Range": `bytes */${totalLength}` },
    });
  }

  if (parsed.kind === "range") {
    const object = await storage.get(options.key, parsed.range);
    return new Response(object.body, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Length": String(parsed.range.end - parsed.range.start + 1),
        "Content-Range": `bytes ${parsed.range.start}-${parsed.range.end}/${totalLength}`,
      },
    });
  }

  const object = await storage.get(options.key);
  return new Response(object.body, {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(totalLength) },
  });
}

/** Strips anything that could break out of the Content-Disposition quoting. */
function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "audio.wav";
}
