import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/shared/api";
import { waveDb } from "@/shared/storage";
import type { Track } from "@/shared/types";
import { TrackPreloader } from "./trackPreloader";

const track = (id: string): Track => ({ id, title: id, artists: "", durationMs: 1000, coverUrl: "", playCount: 0 });

describe("TrackPreloader", () => {
  let playing: string | null;
  let session: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    playing = null;
    session = vi.spyOn(api, "createPlaybackSession").mockRejectedValue(new Error("offline"));
  });

  afterEach(() => vi.restoreAllMocks());

  const preloader = (ready: () => Promise<void> = () => Promise.resolve()) => new TrackPreloader({ ready, playingTrackId: () => playing });

  it("skips the track that is playing", async () => {
    playing = "now";
    await preloader().preload(track("now"));
    expect(session).not.toHaveBeenCalled();
  });

  it("skips a track already in the cache", async () => {
    vi.spyOn(waveDb, "getAudio").mockResolvedValue({ blob: new Blob(), byteSize: 1 } as never);
    await preloader().preload(track("cached"));
    expect(session).not.toHaveBeenCalled();
  });

  it("asks for a stream once downloads are let go, and survives its failure", async () => {
    vi.spyOn(waveDb, "getAudio").mockResolvedValue(null);
    await expect(preloader().preload(track("next"))).resolves.toBeUndefined();
    expect(session).toHaveBeenCalledWith("next", expect.any(AbortSignal));
  });

  it("drops a preload cleared while it waits", async () => {
    vi.spyOn(waveDb, "getAudio").mockResolvedValue(null);
    let release = () => {};
    const ready = new Promise<void>((resolve) => (release = resolve));
    const loader = preloader(() => ready);
    const running = loader.preload(track("next"));
    await vi.waitFor(() => expect(waveDb.getAudio).toHaveBeenCalled());
    await Promise.resolve();
    loader.clear();
    release();
    await running;
    expect(session).not.toHaveBeenCalled();
  });
});
