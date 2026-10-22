import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FADE_FLOOR, fadeInAlongPlayback, fadeVolume, retireAudio } from "./audioFades";

function audioAt(currentTime: number, extra: Partial<HTMLAudioElement> = {}): HTMLAudioElement {
  const audio = document.createElement("audio");
  Object.defineProperty(audio, "currentTime", { value: currentTime, writable: true });
  Object.assign(audio, extra);
  return audio;
}

function playTo(audio: HTMLAudioElement, seconds: number): void {
  audio.currentTime = seconds;
  audio.dispatchEvent(new Event("timeupdate"));
}

describe("fadeVolume", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reaches the target and then reports done", () => {
    const audio = audioAt(0);
    audio.volume = 0;
    const onDone = vi.fn();
    fadeVolume(audio, 0.8, onDone);
    vi.advanceTimersByTime(100);
    expect(audio.volume).toBeGreaterThan(0);
    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(audio.volume).toBeCloseTo(0.8);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("takes as long as it is asked to", () => {
    const audio = audioAt(0);
    audio.volume = 0;
    const onDone = vi.fn();
    fadeVolume(audio, 1, onDone, 900);
    vi.advanceTimersByTime(400);
    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(audio.volume).toBeCloseTo(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("stays put once cancelled", () => {
    const audio = audioAt(0);
    audio.volume = 1;
    const onDone = vi.fn();
    fadeVolume(audio, 0, onDone)();
    vi.advanceTimersByTime(500);
    expect(audio.volume).toBe(1);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("sets the volume at once in a hidden page", () => {
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    const audio = audioAt(0);
    audio.volume = 0;
    const onDone = vi.fn();
    fadeVolume(audio, 0.5, onDone);
    expect(audio.volume).toBe(0.5);
    expect(onDone).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe("fadeInAlongPlayback", () => {
  it("follows playback time and the current target volume", () => {
    const audio = audioAt(10);
    let target = 1;
    fadeInAlongPlayback(audio, 2000, () => target);
    playTo(audio, 11);
    expect(audio.volume).toBeCloseTo(0.5);
    target = 0.5;
    playTo(audio, 12);
    expect(audio.volume).toBeCloseTo(0.5);
  });

  it("never drops below the floor a hidden WebView needs", () => {
    const audio = audioAt(0);
    fadeInAlongPlayback(audio, 1000, () => 1);
    playTo(audio, 0);
    expect(audio.volume).toBe(FADE_FLOOR);
  });
});

describe("retireAudio", () => {
  it("fades out to the end and then removes the element and its blob", () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    const audio = audioAt(98);
    Object.defineProperty(audio, "duration", { value: 100 });
    document.body.appendChild(audio);
    retireAudio(audio, "blob:old");
    playTo(audio, 99);
    expect(audio.volume).toBeCloseTo(0.5);
    audio.dispatchEvent(new Event("ended"));
    expect(audio.isConnected).toBe(false);
    expect(revoke).toHaveBeenCalledWith("blob:old");
    vi.restoreAllMocks();
  });

  it("stops only once however often it is called", () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const stop = retireAudio(audioAt(0), "blob:old");
    stop();
    stop();
    expect(revoke).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});
