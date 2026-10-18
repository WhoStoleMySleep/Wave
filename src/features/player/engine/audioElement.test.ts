import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HAVE_FUTURE_DATA, hasSource, seekWhenLoaded, waitForReadyState } from "./audioElement";

function audioWithReadyState(readyState: number): HTMLAudioElement {
  const audio = document.createElement("audio");
  Object.defineProperty(audio, "readyState", { value: readyState, configurable: true });
  return audio;
}

describe("waitForReadyState", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves right away for an element that is ready", async () => {
    await expect(waitForReadyState(audioWithReadyState(4), HAVE_FUTURE_DATA, 1000)).resolves.toBeUndefined();
  });

  it("resolves on the ready event and removes its listeners", async () => {
    const audio = audioWithReadyState(0);
    const remove = vi.spyOn(audio, "removeEventListener");
    const ready = waitForReadyState(audio, HAVE_FUTURE_DATA, 1000);
    audio.dispatchEvent(new Event("canplay"));
    await ready;
    expect(remove).toHaveBeenCalledWith("canplay", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("gives up after the timeout", async () => {
    const ready = waitForReadyState(audioWithReadyState(0), HAVE_FUTURE_DATA, 1000);
    vi.advanceTimersByTime(1000);
    await expect(ready).resolves.toBeUndefined();
  });
});

describe("seekWhenLoaded", () => {
  it("waits for metadata before seeking", () => {
    const audio = audioWithReadyState(0);
    seekWhenLoaded(audio, 5000);
    expect(audio.currentTime).toBe(0);
    Object.defineProperty(audio, "readyState", { value: 1 });
    audio.dispatchEvent(new Event("loadedmetadata"));
    expect(audio.currentTime).toBe(5);
  });

  it("skips the seek of a load that was superseded", () => {
    const audio = audioWithReadyState(1);
    seekWhenLoaded(audio, 5000, () => false);
    expect(audio.currentTime).toBe(0);
  });
});

describe("audio element helpers", () => {
  it("treats the page address as no source", () => {
    const audio = document.createElement("audio");
    expect(hasSource(audio)).toBe(false);
    audio.src = "blob:track";
    expect(hasSource(audio)).toBe(true);
  });
});
