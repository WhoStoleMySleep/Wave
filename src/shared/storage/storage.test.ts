import { describe, it, expect, beforeEach, vi } from "vitest";
import { waveDb } from "./waveDb";
import { audioCache } from "./audioCache";
import { RecordStore } from "./recordStore";

describe("waveDb storage layer", () => {
  beforeEach(async () => {
    await waveDb.clearAll();
  });

  it("stores and retrieves track metadata", async () => {
    await waveDb.putTrack({
      id: "track_test_1",
      title: "Test Song",
      artists: "Test Artist",
      durationMs: 180000,
      coverUrl: "",
      playCount: 0,
    });

    const record = await waveDb.getTrack("track_test_1");
    expect(record).not.toBeNull();
    expect(record?.title).toBe("Test Song");
    expect(record?.artists).toBe("Test Artist");
    expect(record?.durationMs).toBe(180000);
  });

  it("stores, checks, and calculates total bytes for audio blobs", async () => {
    const dummyBlob = new Blob(["dummy audio data content"], { type: "audio/ogg" });
    await audioCache.saveAudioBlob("track_audio_1", dummyBlob, "audio/ogg");

    const hasAudio = await audioCache.hasAudio("track_audio_1");
    expect(hasAudio).toBe(true);

    const totalBytes = await waveDb.getTotalAudioBytes();
    expect(totalBytes).toBe(dummyBlob.size);

    await audioCache.deleteAudio("track_audio_1");
    const hasAudioAfter = await audioCache.hasAudio("track_audio_1");
    expect(hasAudioAfter).toBe(false);
  });

  it("stores lyrics and updates weekly checked timestamp", async () => {
    const initialTime = Date.now() - 10000;
    await waveDb.putLyrics({
      trackId: "track_lyric_1",
      syncLevel: "word_level",
      quality: 95,
      activeProvider: "kugou",
      availableProviders: [],
      rawLyrics: "[00:01.00] Hello world",
      rawFormat: "lrc",
      candidate: {
        provider: "kugou",
        contentKind: "word_synced",
        syncLevel: "word_level",
        quality: {
          total: 95,
          match: 30,
          content: 30,
          sync: 35,
          source: 0,
          reasons: [],
        },
        lyrics: {
          format: "lrc",
          content: "[00:01.00] Hello world",
        },
      },
      lastCheckedAt: initialTime,
      updatedAt: initialTime,
    });

    const record = await waveDb.getLyrics("track_lyric_1");
    expect(record).not.toBeNull();
    expect(record?.syncLevel).toBe("word_level");
    expect(record?.quality).toBe(95);
    expect(record?.lastCheckedAt).toBe(initialTime);

    await waveDb.updateLyricsChecked("track_lyric_1");
    const updated = await waveDb.getLyrics("track_lyric_1");
    expect(updated?.lastCheckedAt).toBeGreaterThan(initialTime);

    await waveDb.putLyrics({
      trackId: "track_line_only",
      syncLevel: "line_level",
      quality: 60,
      activeProvider: "lrclib",
      availableProviders: [],
      rawLyrics: "[00:01.00] Line only",
      rawFormat: "lrc",
      candidate: {
        provider: "lrclib",
        contentKind: "line_synced",
        syncLevel: "line_level",
        quality: {
          total: 60,
          match: 20,
          content: 20,
          sync: 20,
          source: 0,
          reasons: [],
        },
        lyrics: {
          format: "lrc",
          content: "[00:01.00] Line only",
        },
      },
      lastCheckedAt: initialTime,
      updatedAt: initialTime,
    });
    const lineRecord = await waveDb.getLyrics("track_line_only");
    expect(lineRecord).not.toBeNull();
    expect(lineRecord?.activeProvider).toBe("lrclib");
    expect(lineRecord?.syncLevel).toBe("line_level");

    // cadence / polaris with line_level should not be cached
    await waveDb.putLyrics({
      trackId: "track_cadence_line",
      syncLevel: "line_level",
      quality: 70,
      activeProvider: "cadence",
      availableProviders: [],
      rawLyrics: "[00:01.00] Cadence line",
      rawFormat: "lrc",
      candidate: {
        provider: "cadence",
        contentKind: "line_synced",
        syncLevel: "line_level",
        quality: {
          total: 70,
          match: 20,
          content: 20,
          sync: 30,
          source: 0,
          reasons: [],
        },
        lyrics: {
          format: "lrc",
          content: "[00:01.00] Cadence line",
        },
      },
      lastCheckedAt: initialTime,
      updatedAt: initialTime,
    });
    const cadenceRecord = await waveDb.getLyrics("track_cadence_line");
    expect(cadenceRecord).toBeNull();
  });

  it("tracks lastPlayedAt on putAudio and touchAudio", async () => {
    const blob1 = new Blob(["audio content 1"], { type: "audio/ogg" });
    const earlyTime = 100000;
    await waveDb.putAudio("track_lru_1", blob1, { mimeType: "audio/ogg", lastPlayedAt: earlyTime });

    const initial = await waveDb.getAudio("track_lru_1");
    expect(initial?.lastPlayedAt).toBe(earlyTime);

    await waveDb.touchAudio("track_lru_1");
    const touched = await waveDb.getAudio("track_lru_1");
    expect(touched?.lastPlayedAt).toBeGreaterThan(earlyTime);
  });

  it("records a play without rewriting the stored audio", async () => {
    await waveDb.putAudio("track_playing", new Blob(["audio"]), { mimeType: "audio/ogg", lastPlayedAt: 1000 });
    const put = vi.spyOn(RecordStore.prototype, "put");

    await waveDb.touchAudio("track_playing");

    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][0]).not.toHaveProperty("blob");
    put.mockRestore();
  });

  it("forgets the play time together with the audio", async () => {
    await waveDb.putAudio("track_gone", new Blob(["audio"]), { mimeType: "audio/ogg", lastPlayedAt: 9000 });
    await waveDb.deleteAudio("track_gone");
    await waveDb.putAudio("track_gone", new Blob(["audio"]), { mimeType: "audio/ogg", lastPlayedAt: 1000 });

    expect((await waveDb.getAudio("track_gone"))?.lastPlayedAt).toBe(1000);
  });

  it("enforces cache limit and evicts oldest played tracks first", async () => {
    const chunk1 = new Blob(["1234567890".repeat(10)], { type: "audio/ogg" });
    const chunk2 = new Blob(["1234567890".repeat(10)], { type: "audio/ogg" });
    const chunk3 = new Blob(["1234567890".repeat(10)], { type: "audio/ogg" });

    await waveDb.putAudio("track_oldest", chunk1, { mimeType: "audio/ogg", lastPlayedAt: 1000 });
    await waveDb.putAudio("track_middle", chunk2, { mimeType: "audio/ogg", lastPlayedAt: 2000 });
    await waveDb.putAudio("track_newest", chunk3, { mimeType: "audio/ogg", lastPlayedAt: 3000 });

    const initialTotal = await waveDb.getTotalAudioBytes();
    expect(initialTotal).toBe(300);

    const limit = 200;
    const evicted = await audioCache.enforceCacheLimit(limit);
    expect(evicted).toBeGreaterThan(0);

    const hasOldest = await audioCache.hasAudio("track_oldest");
    const hasNewest = await audioCache.hasAudio("track_newest");

    expect(hasOldest).toBe(false);
    expect(hasNewest).toBe(true);
  });

  it("never evicts downloaded tracks and excludes them from the limit", async () => {
    const chunk = () => new Blob(["1234567890".repeat(10)], { type: "audio/ogg" });

    await waveDb.putAudio("track_pinned", chunk(), { mimeType: "audio/ogg", lastPlayedAt: 500 });
    await waveDb.putAudio("track_old", chunk(), { mimeType: "audio/ogg", lastPlayedAt: 1000 });
    await waveDb.putAudio("track_new", chunk(), { mimeType: "audio/ogg", lastPlayedAt: 2000 });
    await waveDb.putDownload({
      id: "track_pinned",
      title: "Pinned",
      artists: "Artist",
      coverUrl: "",
      durationMs: 1000,
      playCount: 0,
    });

    expect(await audioCache.enforceCacheLimit(200)).toBe(0);

    await audioCache.enforceCacheLimit(150);
    expect(await audioCache.hasAudio("track_pinned")).toBe(true);
    expect(await audioCache.hasAudio("track_old")).toBe(false);
    expect(await audioCache.hasAudio("track_new")).toBe(true);

    const usage = await audioCache.getUsage();
    expect(usage).toEqual({ cacheBytes: 100, downloadBytes: 100, downloadCount: 1 });

    await audioCache.clearUnpinned();
    expect(await audioCache.hasAudio("track_new")).toBe(false);
    expect(await audioCache.hasAudio("track_pinned")).toBe(true);
  });

  it("handles getLimitBytes and setLimitBytes with defaults and clamping", async () => {
    const memStorage = new Map<string, string>();
    const mockStorage = {
      getItem: (key: string) => memStorage.get(key) ?? null,
      setItem: (key: string, val: string) => memStorage.set(key, val),
      removeItem: (key: string) => memStorage.delete(key),
      clear: () => memStorage.clear(),
      length: 0,
      key: () => null,
    };
    Object.defineProperty(window, "localStorage", {
      value: mockStorage,
      writable: true,
      configurable: true,
    });

    expect(audioCache.getLimitBytes()).toBe(10 * 1024 * 1024 * 1024);

    await audioCache.setLimitBytes(100);
    expect(audioCache.getLimitBytes()).toBe(250 * 1024 * 1024);

    await audioCache.setLimitBytes(0);
    expect(audioCache.getLimitBytes()).toBe(0);

    await audioCache.setLimitBytes(5 * 1024 * 1024 * 1024);
    expect(audioCache.getLimitBytes()).toBe(5 * 1024 * 1024 * 1024);
  });
});
