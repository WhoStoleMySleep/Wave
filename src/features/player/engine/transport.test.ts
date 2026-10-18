import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "@/shared/types";
import { usePlayerStore } from "../store/playerStore";
import { playerRuntime } from "./playerRuntime";
import { clampPosition, loadTrack, pausePlayback, seekPlayback, stopPlayback } from "./transport";

const track: Track = { id: "t", title: "t", artists: "", durationMs: 200_000, coverUrl: "", playCount: 0 };
const runtime = playerRuntime!;

describe("transport", () => {
  beforeEach(() => {
    usePlayerStore.setState({ status: "idle", queue: [track], currentIndex: 0, currentTrack: track, positionMs: 0, durationMs: 200_000 });
    vi.spyOn(runtime, "loadAndPlay").mockResolvedValue(undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it("clamps a seek into the track", () => {
    expect(clampPosition(-5, { durationMs: 1000, currentTrack: null })).toBe(0);
    expect(clampPosition(5000, { durationMs: 1000, currentTrack: null })).toBe(1000);
    expect(clampPosition(5000, { durationMs: 0, currentTrack: track })).toBe(5000);
    expect(clampPosition(5000, { durationMs: 0, currentTrack: null })).toBe(5000);
  });

  it("drops a track still loading instead of pausing it", () => {
    usePlayerStore.setState({ status: "loading" });
    const cancel = vi.spyOn(runtime, "cancelPendingLoad").mockImplementation(() => {});
    const pause = vi.spyOn(runtime, "pause").mockImplementation(() => {});
    pausePlayback();
    expect(cancel).toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().status).toBe("paused");
  });

  it("loads a track from its start in one update with the queue", () => {
    const other = { ...track, id: "o", durationMs: 1234 };
    loadTrack(other, 1, [track, other]);
    const state = usePlayerStore.getState();
    expect(state.currentTrack?.id).toBe("o");
    expect(state.currentIndex).toBe(1);
    expect(state.durationMs).toBe(1234);
    expect(state.status).toBe("loading");
    expect(runtime.loadAndPlay).toHaveBeenCalledWith(other);
  });

  it("hands a seek to the loading track as its start", () => {
    usePlayerStore.setState({ status: "loading" });
    vi.spyOn(runtime, "hasLoadedSourceFor").mockReturnValue(false);
    vi.spyOn(runtime, "getCurrentTrackId").mockReturnValue("t");
    const pending = vi.spyOn(runtime, "setPendingSeek").mockImplementation(() => {});
    seekPlayback(5000, false);
    expect(pending).toHaveBeenCalledWith(5000);
  });

  it("only remembers a seek of a paused unloaded track, unless asked to play", () => {
    usePlayerStore.setState({ status: "paused" });
    vi.spyOn(runtime, "hasLoadedSourceFor").mockReturnValue(false);
    seekPlayback(5000, false);
    expect(usePlayerStore.getState().positionMs).toBe(5000);
    expect(runtime.loadAndPlay).not.toHaveBeenCalled();
    seekPlayback(6000, true);
    expect(runtime.loadAndPlay).toHaveBeenCalledWith(track, 6000);
  });

  it("stops to an empty idle player", () => {
    vi.spyOn(runtime, "pause").mockImplementation(() => {});
    stopPlayback();
    const state = usePlayerStore.getState();
    expect(state.status).toBe("idle");
    expect(state.currentTrack).toBeNull();
    expect(state.currentIndex).toBe(-1);
  });
});
