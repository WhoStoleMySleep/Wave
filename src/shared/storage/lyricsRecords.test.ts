import { describe, it, expect } from "vitest";
import type { LyricsCandidate, LyricsSyncLevel } from "@/shared/contracts/lyrics";
import { lyricsBytes, toCacheableLyrics, withProviders } from "./lyricsRecords";
import type { CachedLyricsRecord } from "./records";

function candidate(provider: string, syncLevel: LyricsSyncLevel, total: number): LyricsCandidate {
  return {
    provider,
    contentKind: syncLevel === "word_level" ? "word_synced" : "line_synced",
    syncLevel,
    quality: { total, match: 0, content: 0, sync: 0, source: 0, reasons: [] },
    lyrics: { format: "lrc", content: `${provider} text` },
  };
}

function record(primary: LyricsCandidate, others: LyricsCandidate[] = []): CachedLyricsRecord {
  return {
    trackId: "t1",
    syncLevel: primary.syncLevel,
    quality: primary.quality.total,
    activeProvider: primary.provider,
    availableProviders: others.map((c) => ({ provider: c.provider, syncLevel: c.syncLevel, quality: c.quality.total, candidate: c })),
    rawLyrics: primary.lyrics.content,
    rawFormat: primary.lyrics.format,
    candidate: primary,
    lastCheckedAt: 0,
    updatedAt: 0,
  };
}

describe("withProviders", () => {
  it("rebuilds the provider map of an old record from its candidates", () => {
    const result = withProviders(record(candidate("Kugou", "word_level", 90), [candidate("lrclib", "line_level", 60)]));
    expect(Object.keys(result.providers ?? {})).toEqual(["kugou", "lrclib"]);
  });

  it("leaves a record that already has providers untouched", () => {
    const current = { ...record(candidate("kugou", "word_level", 90)), providers: {} };
    expect(withProviders(current)).toBe(current);
  });
});

describe("toCacheableLyrics", () => {
  it("falls back to a cacheable option when the primary candidate is not worth caching", () => {
    const result = toCacheableLyrics(record(candidate("cadence", "line_level", 99), [candidate("lrclib", "line_level", 60)]));
    expect(result?.activeProvider).toBe("lrclib");
    expect(result?.rawLyrics).toBe("lrclib text");
    expect(Object.keys(result?.providers ?? {})).toEqual(["lrclib"]);
  });

  it("returns null when no candidate is worth caching", () => {
    expect(toCacheableLyrics(record(candidate("polaris", "line_level", 80)))).toBeNull();
  });
});

describe("lyricsBytes", () => {
  it("counts every provider's text, or the raw lyrics of an old record", () => {
    const old = record(candidate("kugou", "word_level", 90));
    expect(lyricsBytes(old)).toBe("kugou text".length * 2);
    expect(lyricsBytes(withProviders(record(old.candidate, [candidate("lrclib", "line_level", 60)])))).toBe(
      ("kugou text".length + "lrclib text".length) * 2,
    );
  });
});
