import { describe, expect, it, beforeEach } from "vitest";
import type { LyricsCandidate, LyricsFormat } from "@/shared/contracts/lyrics";
import { hasSyncedLyricsSources } from "./lib/syncedSources";
import { toProviderOption } from "./lib/candidateRanking";
import { lyricsPatchFor, useLyricsStore } from "./store/lyricsStore";

function candidate(provider: string, content: string, format: LyricsFormat = "lrc"): LyricsCandidate {
  return {
    provider,
    contentKind: format === "plain" ? "plain" : "line_synced",
    syncLevel: format === "plain" ? "plain" : "line_level",
    quality: { total: 70, match: 0, content: 0, sync: 0, source: 0, reasons: [] },
    lyrics: { format, content },
  };
}

describe("lyrics store", () => {
  beforeEach(() => {
    useLyricsStore.getState().reset();
    useLyricsStore.setState({ trackOffsets: {} });
  });

  it("shows a chosen provider with the current offset applied", () => {
    const lrclib = candidate("lrclib", "[00:02.00] hello");
    useLyricsStore.getState().setLyricsState({ currentLyricsTrackId: "t1", availableProviders: [toProviderOption(lrclib)] });
    useLyricsStore.getState().setOffset(300);

    useLyricsStore.getState().selectProvider("lrclib");

    const state = useLyricsStore.getState();
    expect(state.activeProvider).toBe("lrclib");
    expect(state.baseSyncedLines[0].timeMs).toBe(2000);
    expect(state.syncedLines[0].timeMs).toBe(2300);
  });

  it("ignores a provider that is not offered", () => {
    useLyricsStore.getState().selectProvider("missing");
    expect(useLyricsStore.getState().activeProvider).toBeNull();
  });

  it("forgets a track's saved offset once it is set back to zero", () => {
    useLyricsStore.getState().setLyricsState({ currentLyricsTrackId: "t1" });
    useLyricsStore.getState().setOffset(250);
    useLyricsStore.getState().setOffset(0);
    expect(useLyricsStore.getState().trackOffsets).toEqual({});
  });

  it("keeps saved offsets through a reset", () => {
    useLyricsStore.getState().setLyricsState({ currentLyricsTrackId: "t1" });
    useLyricsStore.getState().setOffset(250);
    useLyricsStore.getState().reset();
    expect(useLyricsStore.getState().trackOffsets).toEqual({ t1: 250 });
  });

  it("builds the shown fields from a candidate", () => {
    const patch = lyricsPatchFor(candidate("plainer", "just words", "plain"));
    expect(patch.plainLyrics).toBe("just words");
    expect(patch.rawFormat).toBe("plain");
    expect(patch.activeProvider).toBe("plainer");
  });
});

describe("hasSyncedLyricsSources", () => {
  it("is false for plain lyrics only", () => {
    const plain = toProviderOption(candidate("p", "words", "plain"));
    expect(hasSyncedLyricsSources([plain], [{ startTimeMs: 0, durationMs: 0, words: "words" }], "plain")).toBe(false);
    expect(hasSyncedLyricsSources()).toBe(false);
  });

  it("is true when a provider, a timed line or the shown format is synced", () => {
    expect(hasSyncedLyricsSources([toProviderOption(candidate("s", "[00:01.00] a"))])).toBe(true);
    expect(hasSyncedLyricsSources([], [{ startTimeMs: 1000, durationMs: 0, words: "a" }])).toBe(true);
    expect(hasSyncedLyricsSources([], [], "lrc")).toBe(true);
  });
});
