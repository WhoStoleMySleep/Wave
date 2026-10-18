import { describe, expect, it, vi } from "vitest";
import { isRealEnd, knownDurationMs, listenMediaEvents, mediaErrorInfo, positionMs, type MediaHandlers } from "./mediaEvents";

function audioAt(currentTime: number, duration: number): HTMLAudioElement {
  const audio = document.createElement("audio");
  Object.defineProperty(audio, "currentTime", { value: currentTime, configurable: true });
  Object.defineProperty(audio, "duration", { value: duration, configurable: true });
  return audio;
}

function handlers(): MediaHandlers {
  return { timeupdate: vi.fn(), durationchange: vi.fn(), waiting: vi.fn(), ended: vi.fn(), playing: vi.fn(), pause: vi.fn(), error: vi.fn() };
}

describe("listenMediaEvents", () => {
  it("passes the element to the handler of each event", () => {
    const audio = document.createElement("audio");
    const routes = handlers();
    listenMediaEvents(audio, routes, () => true);
    audio.dispatchEvent(new Event("waiting"));
    expect(routes.waiting).toHaveBeenCalledWith(audio);
    expect(routes.ended).not.toHaveBeenCalled();
  });

  it("stays quiet while the element is inactive", () => {
    const audio = document.createElement("audio");
    const routes = handlers();
    let active = false;
    listenMediaEvents(audio, routes, () => active);
    audio.dispatchEvent(new Event("pause"));
    active = true;
    audio.dispatchEvent(new Event("pause"));
    expect(routes.pause).toHaveBeenCalledTimes(1);
  });
});

describe("media readings", () => {
  it("reports the position in whole milliseconds", () => {
    expect(positionMs(audioAt(1.2345, 10))).toBe(1235);
  });

  it("has no position before the element knows its time", () => {
    expect(positionMs(audioAt(Number.NaN, 10))).toBeNull();
  });

  it("has no duration until the element learns it", () => {
    expect(knownDurationMs(audioAt(0, Number.NaN))).toBeNull();
    expect(knownDurationMs(audioAt(0, 0))).toBeNull();
    expect(knownDurationMs(audioAt(0, 2.5))).toBe(2500);
  });

  it("counts an end only near the real end of the track", () => {
    expect(isRealEnd(audioAt(99, 100))).toBe(true);
    expect(isRealEnd(audioAt(98.5, 100))).toBe(true);
    expect(isRealEnd(audioAt(50, 100))).toBe(false);
    expect(isRealEnd(audioAt(0, Number.NaN))).toBe(false);
  });

  it("falls back to a default message when the error has none", () => {
    const audio = document.createElement("audio");
    Object.defineProperty(audio, "error", { value: { code: 4, message: "" }, configurable: true });
    expect(mediaErrorInfo(audio)).toEqual({ code: 4, message: "Audio playback error" });
    Object.defineProperty(audio, "error", { value: { code: 2, message: "network" }, configurable: true });
    expect(mediaErrorInfo(audio)).toEqual({ code: 2, message: "network" });
  });
});
