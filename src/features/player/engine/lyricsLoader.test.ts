import { afterEach, describe, expect, it, vi } from "vitest";
import { api, type LyricsCandidate } from "@/shared/api";
import { waveDb } from "@/shared/storage";
import { toProviderOption } from "@/features/lyrics";
import { LyricsLoader, lyricsStateFor, mergeProvider, needsRefresh } from "./lyricsLoader";

const DAY_MS = 24 * 60 * 60 * 1000;

const candidate = (provider: string, total: number, syncLevel: LyricsCandidate["syncLevel"] = "line_level"): LyricsCandidate => ({
  provider,
  syncLevel,
  contentKind: "line_synced",
  lyrics: { format: "plain", content: `${provider} words` },
  quality: { total, match: 0, content: 0, sync: 0, source: 0, reasons: [] },
});

describe("lyrics helpers", () => {
  it("replaces a provider's row and keeps the best first", () => {
    const providers = [toProviderOption(candidate("a", 50)), toProviderOption(candidate("b", 40))];
    const merged = mergeProvider(providers, toProviderOption(candidate("b", 90)));
    expect(merged.map((item) => [item.provider, item.quality])).toEqual([
      ["b", 90],
      ["a", 50],
    ]);
    expect(providers[1].quality).toBe(40);
  });

  it("ranks a better sync level above a higher score", () => {
    const merged = mergeProvider([toProviderOption(candidate("plain", 99, "plain"))], toProviderOption(candidate("synced", 10)));
    expect(merged[0].provider).toBe("synced");
  });

  it("shows the candidate as the active lyrics", () => {
    const state = lyricsStateFor(candidate("a", 70), []);
    expect(state.activeProvider).toBe("a");
    expect(state.rawLyrics).toBe("a words");
    expect(state.lyricsQuality).toBe(70);
  });

  it("refreshes lyrics checked a week ago unless the user picked them", () => {
    const now = 100 * DAY_MS;
    const record = { trackId: "t", candidate: candidate("a", 1), timestamp: now - 8 * DAY_MS };
    expect(needsRefresh(record, now)).toBe(true);
    expect(needsRefresh({ ...record, timestamp: now - DAY_MS }, now)).toBe(false);
    const locked = {
      ...record,
      syncLevel: "line_level" as const,
      quality: 1,
      activeProvider: "a",
      availableProviders: [],
      rawLyrics: "",
      rawFormat: "plain",
      lastCheckedAt: 0,
      updatedAt: 0,
      userLocked: true,
    };
    expect(needsRefresh(locked, now)).toBe(false);
    expect(needsRefresh({ ...locked, userLocked: false }, now)).toBe(true);
  });
});

describe("LyricsLoader.prefetch", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shares one request between parallel calls for the same track", async () => {
    vi.spyOn(waveDb, "getLyrics").mockResolvedValue(null);
    vi.spyOn(waveDb, "putLyrics").mockResolvedValue();
    const stream = vi.spyOn(api, "streamLyrics").mockImplementation(async function* () {
      yield { type: "done", cached: false };
    });
    const loader = new LyricsLoader();
    await Promise.all([loader.prefetch("shared-track"), loader.prefetch("shared-track")]);
    expect(stream).toHaveBeenCalledTimes(1);
  });

  it("skips the server for lyrics stored less than a week ago", async () => {
    vi.spyOn(waveDb, "getLyrics").mockResolvedValue({
      trackId: "fresh-track",
      syncLevel: "line_level",
      quality: 1,
      activeProvider: "a",
      availableProviders: [],
      rawLyrics: "",
      rawFormat: "plain",
      candidate: candidate("a", 1),
      lastCheckedAt: Date.now(),
      updatedAt: Date.now(),
    });
    const stream = vi.spyOn(api, "streamLyrics");
    await new LyricsLoader().prefetch("fresh-track");
    expect(stream).not.toHaveBeenCalled();
  });

  it("logs a failed prefetch instead of rejecting", async () => {
    vi.spyOn(waveDb, "getLyrics").mockRejectedValue(new Error("db closed"));
    await expect(new LyricsLoader().prefetch("broken-track")).resolves.toBeUndefined();
  });
});
