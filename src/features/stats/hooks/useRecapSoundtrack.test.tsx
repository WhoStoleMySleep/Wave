import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import type { CatalogTrack } from "@/shared/api";
import { SAMPLE_MS, type RecapCue } from "../lib/soundtrack";

const audio = vi.hoisted(() => ({ play: vi.fn(), prefetch: vi.fn(), prepare: vi.fn(), setPaused: vi.fn(), setMuted: vi.fn(), stop: vi.fn() }));
const player = vi.hoisted(() => ({ status: "playing", pause: vi.fn(), resume: vi.fn() }));

vi.mock("../lib/recapAudio", () => ({
  RecapAudio: class {
    play = audio.play;
    prefetch = audio.prefetch;
    prepare = audio.prepare;
    setPaused = audio.setPaused;
    setMuted = audio.setMuted;
    stop = audio.stop;
  },
}));

vi.mock("@/features/player", () => ({
  playerEngine: { pause: player.pause, resume: player.resume },
  usePlayerStore: { getState: () => ({ status: player.status }) },
}));

const { useRecapSoundtrack } = await import("./useRecapSoundtrack");

function track(id: string): CatalogTrack {
  return { id, title: id, artists: [], durationMs: 200_000 };
}

const SAMPLES: RecapCue = { kind: "samples", tracks: [track("a"), track("b"), track("c")] };
const SINGLE: RecapCue = { kind: "track", track: track("z") };

describe("useRecapSoundtrack", () => {
  let container: HTMLDivElement;
  let root: Root;
  let sample = -1;

  function Probe({ index, paused = false }: { index: number; paused?: boolean }) {
    sample = useRecapSoundtrack({ cues: [SINGLE, SAMPLES], index, paused, muted: false });
    return null;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("pauses the player while open and lets it go on afterwards", () => {
    act(() => root.render(<Probe index={0} />));
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(audio.play).toHaveBeenCalledWith(SINGLE.track);
    act(() => root.unmount());
    expect(audio.stop).toHaveBeenCalled();
    expect(player.resume).toHaveBeenCalledTimes(1);
    root = createRoot(container);
  });

  it("goes round a list slide's tracks one sample at a time", () => {
    act(() => root.render(<Probe index={1} />));
    expect(sample).toBe(0);
    act(() => vi.advanceTimersByTime(SAMPLE_MS));
    expect(sample).toBe(1);
    expect(audio.play).toHaveBeenLastCalledWith(track("b"));
    act(() => vi.advanceTimersByTime(SAMPLE_MS));
    act(() => vi.advanceTimersByTime(SAMPLE_MS));
    expect(sample).toBe(0);
    expect(audio.play).toHaveBeenLastCalledWith(track("a"));
  });

  it("holds the sample while paused and finishes its time afterwards", () => {
    act(() => root.render(<Probe index={1} />));
    act(() => vi.advanceTimersByTime(SAMPLE_MS - 500));
    act(() => root.render(<Probe index={1} paused />));
    act(() => vi.advanceTimersByTime(SAMPLE_MS * 3));
    expect(sample).toBe(0);
    act(() => root.render(<Probe index={1} />));
    act(() => vi.advanceTimersByTime(500));
    expect(sample).toBe(1);
  });

  it("asks for every stream at once and buffers the slides around", () => {
    act(() => root.render(<Probe index={0} />));
    expect(audio.prefetch).toHaveBeenCalledWith(["z", "a", "b", "c"]);
    expect(audio.prepare).toHaveBeenLastCalledWith([track("z"), track("a"), track("b"), track("c")]);
  });
});
