import { describe, expect, it } from "vitest";
import type { Track } from "@/shared/types";
import { crossfadeMs, isCrossfadeDue } from "./crossfade";

const track = (id: string): Track => ({ id, title: id, artists: "", durationMs: 100_000, coverUrl: "", playCount: 0 });

const playing = {
  crossfadeSeconds: 5,
  status: "playing" as const,
  repeat: "off" as const,
  currentIndex: 0,
  queue: [track("a"), track("b")],
};

function audioAt(currentTime: number, duration: number): HTMLAudioElement {
  const audio = document.createElement("audio");
  Object.defineProperty(audio, "currentTime", { value: currentTime });
  Object.defineProperty(audio, "duration", { value: duration });
  return audio;
}

describe("crossfade", () => {
  it("converts the setting to milliseconds", () => {
    expect(crossfadeMs({ crossfadeSeconds: 3 })).toBe(3000);
  });

  it("is due once the rest of the track fits in the crossfade", () => {
    expect(isCrossfadeDue(audioAt(94, 100), playing)).toBe(false);
    expect(isCrossfadeDue(audioAt(95, 100), playing)).toBe(true);
  });

  it("is never due when off, paused or repeating one track", () => {
    const audio = audioAt(99, 100);
    expect(isCrossfadeDue(audio, { ...playing, crossfadeSeconds: 0 })).toBe(false);
    expect(isCrossfadeDue(audio, { ...playing, status: "paused" })).toBe(false);
    expect(isCrossfadeDue(audio, { ...playing, repeat: "one" })).toBe(false);
  });

  it("waits for a next track, which repeat-all provides at the end of the queue", () => {
    const audio = audioAt(99, 100);
    const last = { ...playing, currentIndex: 1 };
    expect(isCrossfadeDue(audio, last)).toBe(false);
    expect(isCrossfadeDue(audio, { ...last, repeat: "all" })).toBe(true);
  });

  it("skips a track shorter than two crossfades or of unknown length", () => {
    expect(isCrossfadeDue(audioAt(9.5, 9.9), playing)).toBe(false);
    expect(isCrossfadeDue(audioAt(0, Number.POSITIVE_INFINITY), playing)).toBe(false);
  });
});
