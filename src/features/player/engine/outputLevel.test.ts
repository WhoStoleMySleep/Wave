import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore } from "../store/playerStore";
import { FADE_FLOOR } from "./audioFades";
import { OutputLevel } from "./outputLevel";

describe("OutputLevel", () => {
  let audio: HTMLAudioElement;
  let level: OutputLevel;

  beforeEach(() => {
    usePlayerStore.setState({ volume: 0.8, normalizeVolume: true });
    audio = document.createElement("audio");
    level = new OutputLevel(() => audio);
  });

  afterEach(() => vi.restoreAllMocks());

  it("scales the volume by the track gain only with normalization on", () => {
    level.setTrackGain(0.5);
    expect(level.target()).toBeCloseTo(0.4);
    usePlayerStore.setState({ normalizeVolume: false });
    expect(level.target()).toBeCloseTo(0.8);
  });

  it("starts near silence for a fade, and at full level in a hidden page", () => {
    expect(level.startVolume()).toBe(FADE_FLOOR);
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    expect(level.startVolume()).toBeCloseTo(0.8);
  });

  it("follows a volume change on a playing element at once", () => {
    Object.defineProperty(audio, "paused", { value: false });
    usePlayerStore.setState({ volume: 0.3 });
    level.follow();
    expect(audio.volume).toBeCloseTo(0.3);
  });

  it("leaves a paused element alone on a volume change", () => {
    audio.volume = 0.1;
    level.follow();
    expect(audio.volume).toBeCloseTo(0.1);
  });

  it("finishes a fade and calls back", () => {
    vi.useFakeTimers();
    const done = vi.fn();
    audio.volume = 0;
    level.fadeTo(1, done);
    vi.advanceTimersByTime(1000);
    expect(audio.volume).toBe(1);
    expect(done).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("drops a fade it stops", () => {
    vi.useFakeTimers();
    const done = vi.fn();
    audio.volume = 0;
    level.fadeTo(1, done);
    level.stopFade();
    vi.advanceTimersByTime(1000);
    expect(done).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
