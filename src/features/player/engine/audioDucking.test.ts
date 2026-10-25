import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore } from "../store/playerStore";
import { DUCK_MS, DuckGlide, installAudioDucking, RESTORE_MS } from "./audioDucking";
import { OutputLevel } from "./outputLevel";

function playingAudio(): HTMLAudioElement {
  const audio = document.createElement("audio");
  Object.defineProperty(audio, "paused", { value: false });
  return audio;
}

describe("DuckGlide", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("eases to the target over the given time instead of jumping", () => {
    const applied: number[] = [];
    const glide = new DuckGlide(playingAudio, (factor) => applied.push(factor));
    glide.glideTo(0.2, DUCK_MS);
    vi.advanceTimersByTime(DUCK_MS / 10);
    expect(glide.current).toBeGreaterThan(0.9);
    vi.advanceTimersByTime(DUCK_MS);
    expect(glide.current).toBeCloseTo(0.2);
    const steps = applied.slice(1).map((value, i) => applied[i] - value);
    expect(Math.max(...steps)).toBeLessThan(0.1);
  });

  it("keeps stepping on timeupdate while timers are throttled", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const audio = playingAudio();
    const glide = new DuckGlide(() => audio, () => {});
    glide.glideTo(0.2, DUCK_MS);
    now.mockReturnValue(DUCK_MS / 2);
    audio.dispatchEvent(new Event("timeupdate"));
    now.mockRestore();
    expect(glide.current).toBeCloseTo(0.6, 1);
  });

  it("turns around from where it is when the target changes mid-glide", () => {
    const glide = new DuckGlide(playingAudio, () => {});
    glide.glideTo(0.2, DUCK_MS);
    vi.advanceTimersByTime(DUCK_MS / 2);
    const turnedAt = glide.current;
    glide.glideTo(1, RESTORE_MS);
    vi.advanceTimersByTime(40);
    expect(Math.abs(glide.current - turnedAt)).toBeLessThan(0.05);
    vi.advanceTimersByTime(RESTORE_MS);
    expect(glide.current).toBe(1);
  });
});

describe("installAudioDucking", () => {
  let audio: HTMLAudioElement;
  let level: OutputLevel;
  let report: (active: boolean) => void;
  let uninstall = () => {};
  const unwatch = vi.fn();
  const watch = vi.fn((onChange: (active: boolean) => void) => {
    report = onChange;
    return unwatch;
  });

  beforeEach(() => {
    vi.useFakeTimers();
    usePlayerStore.setState({ volume: 1, normalizeVolume: false, duckOthers: false, duckVolume: 0.2 });
    audio = playingAudio();
    level = new OutputLevel(() => audio);
    watch.mockClear();
    unwatch.mockClear();
  });

  afterEach(() => {
    uninstall();
    vi.useRealTimers();
  });

  it("asks the shell nothing while the setting is off", () => {
    uninstall = installAudioDucking(level, () => audio, watch);
    expect(watch).not.toHaveBeenCalled();
  });

  it("lowers the music to the chosen level while another app sounds, then brings it back", () => {
    uninstall = installAudioDucking(level, () => audio, watch);
    usePlayerStore.setState({ duckOthers: true });
    report(true);
    vi.advanceTimersByTime(DUCK_MS + 100);
    expect(audio.volume).toBeCloseTo(0.2);
    report(false);
    vi.advanceTimersByTime(RESTORE_MS + 100);
    expect(audio.volume).toBeCloseTo(1);
  });

  it("follows a new level picked while the music is lowered", () => {
    usePlayerStore.setState({ duckOthers: true });
    uninstall = installAudioDucking(level, () => audio, watch);
    report(true);
    vi.advanceTimersByTime(DUCK_MS + 100);
    usePlayerStore.setState({ duckVolume: 0.5 });
    vi.advanceTimersByTime(RESTORE_MS + 100);
    expect(audio.volume).toBeCloseTo(0.5);
  });

  it("stops watching and restores the volume when the setting goes off", () => {
    usePlayerStore.setState({ duckOthers: true });
    uninstall = installAudioDucking(level, () => audio, watch);
    report(true);
    vi.advanceTimersByTime(DUCK_MS + 100);
    usePlayerStore.setState({ duckOthers: false });
    expect(unwatch).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(RESTORE_MS + 100);
    expect(audio.volume).toBeCloseTo(1);
  });
});
