// No `server-only` here — see the note in ./r2.ts; the guard lives on the
// `@/lib/storage` barrel that application code imports.
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { StorageError } from "@/lib/errors";
import type {
  ByteRange,
  ObjectMetadata,
  ObjectStorage,
  PutObjectInput,
  StoredObject,
} from "@/lib/storage/types";

const CONTENT_TYPE_SUFFIX = ".content-type";

/**
 * Filesystem-backed storage used **in development only** when R2 credentials
 * are absent. `assertProductionIntegrations()` prevents this adapter from ever
 * being selected in production.
 *
 * It implements real range reads so the audio player behaves the same locally
 * as it does against R2.
 */
export class LocalStorage implements ObjectStorage {
  readonly kind = "local" as const;

  private readonly rootDirectory: string;

  constructor(rootDirectory: string) {
    // `turbopackIgnore` keeps the bundler from tracing the entire project into
    // the server output because of this dynamic path. This adapter is
    // development-only and reads nothing from the build tree.
    this.rootDirectory = path.resolve(
      /* turbopackIgnore: true */ process.cwd(),
      rootDirectory,
    );
  }

  private resolve(key: string): string {
    const target = path.resolve(this.rootDirectory, key);
    // Defence in depth: keys are derived server-side, but never escape the root.
    if (target !== this.rootDirectory && !target.startsWith(this.rootDirectory + path.sep)) {
      throw new StorageError("Invalid object key.", undefined, { key });
    }
    return target;
  }

  async put(input: PutObjectInput): Promise<{ key: string }> {
    try {
      const filePath = this.resolve(input.key);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, input.body);
      await writeFile(filePath + CONTENT_TYPE_SUFFIX, input.contentType, "utf8");
      return { key: input.key };
    } catch (cause) {
      throw new StorageError("We could not save that audio file.", cause, {
        operation: "put",
        key: input.key,
      });
    }
  }

  async get(key: string, range?: ByteRange): Promise<StoredObject> {
    const filePath = this.resolve(key);

    let totalLength: number;
    try {
      totalLength = (await stat(filePath)).size;
    } catch (cause) {
      throw new StorageError("We could not load that audio file.", cause, {
        operation: "get",
        key,
      });
    }

    const start = range ? Math.max(0, range.start) : 0;
    const end =
      range?.end === undefined
        ? totalLength - 1
        : Math.min(range.end, totalLength - 1);

    if (start > end) {
      throw new StorageError("Requested range is not satisfiable.", undefined, { key });
    }

    const nodeStream = createReadStream(filePath, { start, end });

    return {
      body: Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>,
      contentType: await this.readContentType(filePath),
      contentLength: end - start + 1,
      totalLength,
      range: range ? { start, end } : undefined,
    };
  }

  async head(key: string): Promise<ObjectMetadata | null> {
    const filePath = this.resolve(key);
    try {
      const stats = await stat(filePath);
      return {
        contentType: await this.readContentType(filePath),
        contentLength: stats.size,
      };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolve(key);
    await rm(filePath, { force: true });
    await rm(filePath + CONTENT_TYPE_SUFFIX, { force: true });
  }

  async exists(key: string): Promise<boolean> {
    return (await this.head(key)) !== null;
  }

  /** No signing story on a local disk — callers fall back to sending bytes. */
  async createSignedDownloadUrl(): Promise<string | null> {
    return null;
  }

  private async readContentType(filePath: string): Promise<string> {
    try {
      const { readFile } = await import("node:fs/promises");
      return (await readFile(filePath + CONTENT_TYPE_SUFFIX, "utf8")).trim();
    } catch {
      return "audio/wav";
    }
  }
}
