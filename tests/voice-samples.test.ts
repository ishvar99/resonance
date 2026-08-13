import { afterEach, describe, expect, it } from "vitest";

import { readWavInfo } from "@/lib/audio/wav";
import { createStorageFromEnv } from "@/lib/storage/factory";
import {
  attachFixtureSamples,
  candidateVoiceIds,
  matchSampleFile,
  renderFixtureWav,
} from "../scripts/voice-sample-lib";

describe("storage factory", () => {
  it("falls back to local storage in development without credentials", () => {
    const storage = createStorageFromEnv({}, { production: false, quiet: true });
    expect(storage.kind).toBe("local");
  });

  it("treats empty strings as unset", () => {
    const storage = createStorageFromEnv(
      { R2_ACCOUNT_ID: "", R2_ACCESS_KEY_ID: "  ", R2_SECRET_ACCESS_KEY: "", R2_BUCKET_NAME: "" },
      { production: false, quiet: true },
    );
    expect(storage.kind).toBe("local");
  });

  it("refuses to run production on the local disk", () => {
    expect(() => createStorageFromEnv({}, { production: true })).toThrow(
      /not configured/,
    );
  });

  it("selects R2 when fully configured", () => {
    const storage = createStorageFromEnv(
      {
        R2_ACCOUNT_ID: "acct",
        R2_ACCESS_KEY_ID: "key",
        R2_SECRET_ACCESS_KEY: "secret",
        R2_BUCKET_NAME: "bucket",
      },
      { production: true },
    );
    expect(storage.kind).toBe("r2");
  });

  it("requires the full credential set, not just some of it", () => {
    // Missing secret → not configured → local in dev, throw in production.
    const partial = { R2_ACCOUNT_ID: "acct", R2_ACCESS_KEY_ID: "key", R2_BUCKET_NAME: "b" };
    expect(createStorageFromEnv(partial, { production: false, quiet: true }).kind).toBe("local");
    expect(() => createStorageFromEnv(partial, { production: true })).toThrow();
  });
});

describe("sample filename matching", () => {
  it("accepts supported audio extensions", () => {
    expect(matchSampleFile("aaron.wav")).toEqual({
      stem: "aaron",
      extension: "wav",
      contentType: "audio/wav",
    });
    expect(matchSampleFile("emma.MP3")?.contentType).toBe("audio/mpeg");
    expect(matchSampleFile("nova.flac")?.extension).toBe("flac");
  });

  it("rejects hidden files, unsupported types and extension-only names", () => {
    expect(matchSampleFile(".DS_Store")).toBeNull();
    expect(matchSampleFile(".hidden.wav")).toBeNull();
    expect(matchSampleFile("notes.txt")).toBeNull();
    expect(matchSampleFile("archive.zip")).toBeNull();
    expect(matchSampleFile("aaron")).toBeNull();
  });

  it("maps stems to system voice ids, slug or full id alike", () => {
    expect(candidateVoiceIds("aaron")).toEqual(["system_aaron", "aaron"]);
    expect(candidateVoiceIds("system_aaron")).toEqual(["system_aaron"]);
    // Sanitised so a filename cannot smuggle arbitrary characters into a query.
    expect(candidateVoiceIds("Emma Watson!")).toEqual([
      "system_emma_watson_",
      "emma_watson_",
    ]);
  });
});

describe("fixture production guard", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("refuses to attach placeholder audio in production", async () => {
    process.env.NODE_ENV = "production";

    // The guard must fire before anything touches the database or storage —
    // both are poison stubs that fail the test if reached.
    const poison = new Proxy(
      {},
      {
        get() {
          throw new Error("production guard did not fire first");
        },
      },
    );

    await expect(
      attachFixtureSamples(
        poison as never,
        poison as never,
      ),
    ).rejects.toThrow(/production/i);
  });
});

describe("fixture rendering", () => {
  it("produces a valid mono 24kHz WAV", async () => {
    const wav = await renderFixtureWav({ id: "system_aaron", name: "Aaron" });
    const info = readWavInfo(wav);

    expect(info).not.toBeNull();
    expect(info!.sampleRate).toBe(24_000);
    expect(info!.channels).toBe(1);
    expect(info!.durationSeconds).toBeGreaterThan(3);
  });

  it("is deterministic per voice and distinct across voices", async () => {
    const aaron1 = await renderFixtureWav({ id: "system_aaron", name: "Aaron" });
    const aaron2 = await renderFixtureWav({ id: "system_aaron", name: "Aaron" });
    const emma = await renderFixtureWav({ id: "system_emma", name: "Emma" });

    expect(Buffer.from(aaron1)).toEqual(Buffer.from(aaron2));
    expect(Buffer.from(aaron1)).not.toEqual(Buffer.from(emma));
  });
});
