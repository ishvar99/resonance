import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { StorageError } from "@/lib/errors";
import type {
  ByteRange,
  ObjectMetadata,
  ObjectStorage,
  PutObjectInput,
  StoredObject,
} from "@/lib/storage/types";

export type R2StorageConfig = {
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
};

function isNotFound(error: unknown): boolean {
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    candidate?.name === "NotFound" ||
    candidate?.name === "NoSuchKey" ||
    candidate?.$metadata?.httpStatusCode === 404
  );
}

/**
 * S3-compatible storage. Works against Cloudflare R2 (the default target), AWS
 * S3 and MinIO — only the endpoint and region differ.
 */
export class R2Storage implements ObjectStorage {
  readonly kind = "r2" as const;

  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: R2StorageConfig) {
    const clientConfig: S3ClientConfig = {
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // R2 and MinIO both require path-style addressing.
      forcePathStyle: true,
    };

    this.client = new S3Client(clientConfig);
    this.bucket = config.bucket;
  }

  async put(input: PutObjectInput): Promise<{ key: string }> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          ContentLength: input.body.byteLength,
          Metadata: input.metadata,
        }),
      );
      return { key: input.key };
    } catch (cause) {
      throw new StorageError("We could not save that audio file.", cause, {
        operation: "put",
        key: input.key,
      });
    }
  }

  async get(key: string, range?: ByteRange): Promise<StoredObject> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Range: range ? formatRangeHeader(range) : undefined,
        }),
      );

      if (!response.Body) {
        throw new StorageError("That audio file is empty.", undefined, { key });
      }

      const contentLength = response.ContentLength ?? 0;
      const parsedRange = parseContentRange(response.ContentRange);

      return {
        // `transformToWebStream` is provided by the SDK stream mixin and keeps
        // the response streaming rather than buffering the whole object.
        body: response.Body.transformToWebStream(),
        contentType: response.ContentType ?? "application/octet-stream",
        contentLength,
        totalLength: parsedRange?.total ?? contentLength,
        range: parsedRange
          ? { start: parsedRange.start, end: parsedRange.end }
          : undefined,
        etag: response.ETag,
      };
    } catch (cause) {
      if (cause instanceof StorageError) throw cause;
      throw new StorageError("We could not load that audio file.", cause, {
        operation: "get",
        key,
      });
    }
  }

  async head(key: string): Promise<ObjectMetadata | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        contentType: response.ContentType ?? "application/octet-stream",
        contentLength: response.ContentLength ?? 0,
        etag: response.ETag,
      };
    } catch (cause) {
      if (isNotFound(cause)) return null;
      throw new StorageError("We could not read that audio file.", cause, {
        operation: "head",
        key,
      });
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (cause) {
      throw new StorageError("We could not delete that audio file.", cause, {
        operation: "delete",
        key,
      });
    }
  }

  async exists(key: string): Promise<boolean> {
    return (await this.head(key)) !== null;
  }

  async createSignedDownloadUrl(
    key: string,
    expiresInSeconds = 300,
  ): Promise<string | null> {
    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        { expiresIn: expiresInSeconds },
      );
    } catch (cause) {
      throw new StorageError("We could not prepare that audio file.", cause, {
        operation: "sign",
        key,
      });
    }
  }
}

function formatRangeHeader(range: ByteRange): string {
  return range.end === undefined
    ? `bytes=${range.start}-`
    : `bytes=${range.start}-${range.end}`;
}

/** Parses `bytes 0-1023/4096`. */
function parseContentRange(
  header: string | undefined,
): { start: number; end: number; total: number } | null {
  if (!header) return null;
  const match = /bytes (\d+)-(\d+)\/(\d+|\*)/.exec(header);
  if (!match) return null;

  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = match[3] === "*" ? end + 1 : Number(match[3]);
  return { start, end, total };
}
