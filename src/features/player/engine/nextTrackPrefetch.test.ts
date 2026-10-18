import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waveDb } from "@/shared/storage";
import type { Track } from "@/shared/types";
import { usePlayerStore } from "../store/playerStore";
import type { LyricsLoader } from "./lyricsLoader";
import { NextTrackPrefetch } from "./nextTrackPrefetch";
import { playerRuntime } from "./playerRuntime";

const track = (id: string): Track => ({ id, title: id, artists: "", durationMs: 1, coverUrl: "", playCount: 0 });

describe("NextTrackPrefetch", () => {
  let lyrics: { prefetch: ReturnType<typeof vi.fn> };
  let prefetch: NextTrackPrefetch;

  beforeEach(() => {
    usePlayerStore.setState({ queue: [track("a"), track("b")], currentIndex: 0, currentTrack: track("a"), repeat: "off" });
    lyrics = { prefetch: vi.fn().mockResolvedValue(undefined) };
    prefetch = new NextTrackPrefetch(lyrics as unknown as LyricsLoader);
    vi.spyOn(waveDb, "putTrack").mockResolvedValue(undefined);
    vi.spyOn(playerRuntime!, "preloadTrack").mockResolvedValue(undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it("warms up the next track", () => {
    prefetch.run();
    expect(lyrics.prefetch).toHaveBeenCalledWith("b");
    expect(playerRuntime!.preloadTrack).toHaveBeenCalledWith(track("b"));
  });

  it("warms up the same pair once until told to forget it", () => {
    prefetch.run();
    prefetch.run();
    expect(lyrics.prefetch).toHaveBeenCalledTimes(1);
    prefetch.forget();
    prefetch.run();
    expect(lyrics.prefetch).toHaveBeenCalledTimes(2);
  });

  it("does nothing at the end of the queue", () => {
    usePlayerStore.setState({ currentIndex: 1, currentTrack: track("b") });
    prefetch.run();
    expect(lyrics.prefetch).not.toHaveBeenCalled();
  });
});
