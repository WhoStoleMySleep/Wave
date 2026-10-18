import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { playerRuntime } from "./playerRuntime";
import { OutputLevel } from "./outputLevel";
import { usePlayerStore } from "../store/playerStore";
import { api } from "@/shared/api";
import { waveDb } from "@/shared/storage";
import type { Track } from "@/shared/types";

const track: Track = {
  id: "t1",
  title: "Track",
  artists: "Artist",
  durationMs: 100_000,
  coverUrl: "",
  playCount: 0,
};

function setAudioPaused(value: boolean) {
  Object.defineProperty((playerRuntime as any).audio, "paused", {
    value,
    configurable: true,
  });
}

describe("PlayerRuntime — status must always match the real audio state", () => {
  beforeEach(() => {
    usePlayerStore.setState({
      status: "idle",
      currentTrack: track,
      queue: [track],
      currentIndex: 0,
      positionMs: 0,
      durationMs: track.durationMs,
      volume: 1,
      error: null,
    });
    (playerRuntime as any).audio.src = "blob:mock-stream";
    setAudioPaused(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("a stale resume() play-promise settling after a newer pause() must not restart the fade/playback sequence", async () => {
    const fadeSpy = vi.spyOn(OutputLevel.prototype, "fadeTo");

    let resolvePlay: () => void;
    const pendingPlay = new Promise<void>((resolve) => {
      resolvePlay = resolve;
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockReturnValue(pendingPlay as unknown as Promise<void>);
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});

    playerRuntime!.resume();
    expect(usePlayerStore.getState().status).toBe("playing");
    expect(fadeSpy).not.toHaveBeenCalled();

    playerRuntime!.pause();
    expect(usePlayerStore.getState().status).toBe("paused");
    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(fadeSpy).toHaveBeenCalledTimes(1);

    resolvePlay!();
    await pendingPlay;
    await Promise.resolve();
    await Promise.resolve();

    expect(fadeSpy).toHaveBeenCalledTimes(1);
    expect(usePlayerStore.getState().status).toBe("paused");
  });

  it("a stale resume() play-promise rejecting after a newer pause() must not touch status either", async () => {
    let rejectPlay: (err: unknown) => void;
    const pendingPlay = new Promise<void>((_resolve, reject) => {
      rejectPlay = reject;
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockReturnValue(pendingPlay as unknown as Promise<void>);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});

    playerRuntime!.resume();
    playerRuntime!.pause();
    expect(usePlayerStore.getState().status).toBe("paused");

    rejectPlay!(new DOMException("aborted", "AbortError"));
    await pendingPlay.catch(() => {});
    await Promise.resolve();
    await Promise.resolve();

    expect(usePlayerStore.getState().status).toBe("paused");
  });
});

describe("PlayerRuntime audio caching", () => {
  beforeEach(() => {
    if (!globalThis.URL.createObjectURL) {
      globalThis.URL.createObjectURL = vi.fn((_blob: Blob) => "blob:mock-object-url");
    } else {
      vi.spyOn(globalThis.URL, "createObjectURL").mockReturnValue("blob:mock-object-url");
    }
    if (!globalThis.URL.revokeObjectURL) {
      globalThis.URL.revokeObjectURL = vi.fn();
    } else {
      vi.spyOn(globalThis.URL, "revokeObjectURL").mockImplementation(() => {});
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("plays directly from waveDb cache when audio blob exists without calling backend session API", async () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const sessionSpy = vi.spyOn(api, "createPlaybackSession");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const mockBlob = new Blob(["fake-opus-data"], { type: "audio/webm" });
    await waveDb.putAudio("cached-track-1", mockBlob, { mimeType: "audio/webm" });

    const cachedTrack: Track = {
      ...track,
      id: "cached-track-1",
      title: "Cached Track",
    };

    await playerRuntime!.loadAndPlay(cachedTrack);

    expect(sessionSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(playSpy).toHaveBeenCalled();
    expect(usePlayerStore.getState().status).toBe("playing");
  });

  it("fetches, plays, and saves to waveDb on cache miss", async () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const sessionSpy = vi.spyOn(api, "createPlaybackSession").mockResolvedValue({
      sessionId: "pb_123",
      trackId: "fresh-track-2",
      transport: "proxy",
      playbackId: "pb_123",
      streamUrl: "/v1/playback/pb_123/media",
      mimeType: "audio/webm",
      codec: "opus",
      bitrate: 128000,
      expiresAt: new Date().toISOString(),
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 206,
        headers: { "content-type": "audio/webm" },
      }),
    );

    const freshTrack: Track = {
      ...track,
      id: "fresh-track-2",
      title: "Fresh Track",
    };

    await playerRuntime!.loadAndPlay(freshTrack);

    expect(sessionSpy).toHaveBeenCalledTimes(1);
    expect(playSpy).toHaveBeenCalled();
    // the stream gets the connection to itself until it has a buffer
    expect(fetchSpy).not.toHaveBeenCalled();

    document.getElementById("wave-audio")!.dispatchEvent(new Event("canplaythrough"));
    await vi.waitFor(async () => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const storedAudio = await waveDb.getAudio("fresh-track-2");
      expect(storedAudio?.byteSize).toBe(4);
    });
  });

  it("preloads audio in the background and enables instant cache-hit play on skip", async () => {
    const sessionSpy = vi.spyOn(api, "createPlaybackSession").mockResolvedValue({
      sessionId: "pb_preload_1",
      trackId: "next-track-3",
      transport: "proxy",
      playbackId: "pb_preload_1",
      streamUrl: "/v1/playback/pb_preload_1/media",
      mimeType: "audio/webm",
      codec: "opus",
      bitrate: 128000,
      expiresAt: new Date().toISOString(),
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([5, 6, 7, 8]), {
        status: 206,
        headers: { "content-type": "audio/webm" },
      }),
    );

    const nextTrack: Track = {
      ...track,
      id: "next-track-3",
      title: "Next Track",
    };

    await playerRuntime!.preloadTrack(nextTrack);

    expect(sessionSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const storedAudio = await waveDb.getAudio("next-track-3");
    expect(storedAudio).not.toBeNull();
    expect(storedAudio?.byteSize).toBe(4);

    sessionSpy.mockClear();
    fetchSpy.mockClear();

    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    await playerRuntime!.loadAndPlay(nextTrack);

    expect(sessionSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(playSpy).toHaveBeenCalled();
    expect(usePlayerStore.getState().status).toBe("playing");
  });
  it("streams a track whose preload is still downloading instead of waiting for the whole file", async () => {
    vi.spyOn(api, "createPlaybackSession").mockResolvedValue({
      sessionId: "pb_slow",
      trackId: "slow-track",
      transport: "proxy",
      playbackId: "pb_slow",
      streamUrl: "/v1/playback/pb_slow/media",
      mimeType: "audio/webm",
      codec: "opus",
      bitrate: 128000,
      expiresAt: new Date().toISOString(),
    });
    let preloadSignal: AbortSignal | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      preloadSignal ??= init?.signal ?? undefined;
      return new Promise(() => {});
    });
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const slowTrack: Track = { ...track, id: "slow-track", title: "Slow Track" };

    void playerRuntime!.preloadTrack(slowTrack);
    await vi.waitFor(() => expect(preloadSignal).toBeDefined());

    await playerRuntime!.loadAndPlay(slowTrack);

    expect(preloadSignal!.aborted).toBe(true);
    expect(playSpy).toHaveBeenCalled();
    expect((document.getElementById("wave-audio") as HTMLAudioElement).src).toContain("/v1/playback/pb_slow/media");
  });
});
