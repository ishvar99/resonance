/**
 * Minimal 16-bit PCM WAV encoding/inspection.
 *
 * Used by the development speech generator (so mock audio is a real, playable
 * file rather than a placeholder) and by the upload path to read a sample's
 * duration without pulling in a decoding dependency.
 */

export const WAV_HEADER_BYTES = 44;

export function encodeWav(
  samples: Float32Array,
  sampleRate: number,
  channels = 1,
): Uint8Array {
  const bytesPerSample = 2;
  const dataBytes = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, "WAVE");

  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true); // byte rate
  view.setUint16(32, channels * bytesPerSample, true); // block align
  view.setUint16(34, 8 * bytesPerSample, true); // bits per sample

  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = WAV_HEADER_BYTES;
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]!));
    view.setInt16(offset, Math.round(clamped * 0x7fff), true);
    offset += bytesPerSample;
  }

  return new Uint8Array(buffer);
}

export type WavInfo = {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  durationSeconds: number;
};

/** Reads WAV metadata. Returns `null` for anything that is not a PCM WAV. */
export function readWavInfo(bytes: Uint8Array): WavInfo | null {
  if (bytes.byteLength < WAV_HEADER_BYTES) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));

  if (ascii(0, 4) !== "RIFF" || ascii(8, 4) !== "WAVE") return null;

  // Walk the chunk list — `fmt ` and `data` are not always at fixed offsets.
  let cursor = 12;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataBytes = 0;

  while (cursor + 8 <= bytes.byteLength) {
    const chunkId = ascii(cursor, 4);
    const chunkSize = view.getUint32(cursor + 4, true);
    const body = cursor + 8;

    if (chunkId === "fmt " && body + 16 <= bytes.byteLength) {
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bitsPerSample = view.getUint16(body + 14, true);
    } else if (chunkId === "data") {
      dataBytes = Math.min(chunkSize, bytes.byteLength - body);
      break;
    }

    cursor = body + chunkSize + (chunkSize % 2); // chunks are word-aligned
  }

  if (!sampleRate || !channels || !bitsPerSample || !dataBytes) return null;

  const bytesPerFrame = channels * (bitsPerSample / 8);
  return {
    sampleRate,
    channels,
    bitsPerSample,
    durationSeconds: dataBytes / bytesPerFrame / sampleRate,
  };
}
