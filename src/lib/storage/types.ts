/**
 * S3-compatible object storage contract.
 *
 * Implemented by `R2Storage` (Cloudflare R2, AWS S3, MinIO — anything speaking
 * the S3 API) and `LocalStorage` (development only). Nothing outside
 * `src/lib/storage` should know which one is active.
 */

export type ByteRange = {
  /** Inclusive start offset. */
  start: number;
  /** Inclusive end offset. `undefined` means "to the end of the object". */
  end?: number;
};

export type StoredObject = {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  /** Bytes in this response (the range length when a range was requested). */
  contentLength: number;
  /** Bytes in the complete object, used to build a Content-Range header. */
  totalLength: number;
  /** Present only when the request was a range request. */
  range?: { start: number; end: number };
  etag?: string;
};

export type ObjectMetadata = {
  contentType: string;
  contentLength: number;
  etag?: string;
};

export type PutObjectInput = {
  key: string;
  body: Uint8Array;
  contentType: string;
  /** Non-sensitive metadata (organization id, voice id, …). */
  metadata?: Record<string, string>;
};

export interface ObjectStorage {
  readonly kind: "r2" | "local";

  put(input: PutObjectInput): Promise<{ key: string }>;
  get(key: string, range?: ByteRange): Promise<StoredObject>;
  head(key: string): Promise<ObjectMetadata | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;

  /**
   * Short-lived read URL, used to hand a reference sample to the Chatterbox GPU
   * service without giving that service bucket credentials.
   * Unsupported by the local development adapter, which returns `null`.
   */
  createSignedDownloadUrl(
    key: string,
    expiresInSeconds?: number,
  ): Promise<string | null>;
}
