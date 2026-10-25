import { afterEach, describe, expect, it, vi } from "vitest";
import type { WaveAndroidApi } from "./android";
import { otherAudioWatch } from "./otherAudio";

function androidShell(extra: Partial<WaveAndroidApi> = {}): WaveAndroidApi {
  return { updateMedia: vi.fn(), clearMedia: vi.fn(), moveToBack: vi.fn(), ...extra };
}

describe("otherAudioWatch", () => {
  afterEach(() => {
    window.WaveAndroid = undefined;
    window.waveNative = undefined;
    window.__waveOtherAudio = undefined;
  });

  it("is missing in a plain browser tab", () => {
    expect(otherAudioWatch()).toBeNull();
  });

  it("is missing in an Android shell built before ducking", () => {
    window.WaveAndroid = androidShell();
    expect(otherAudioWatch()).toBeNull();
  });

  it("passes the Android shell's reports on until unwatched", () => {
    const watchOtherAudio = vi.fn();
    window.WaveAndroid = androidShell({ watchOtherAudio });
    const onChange = vi.fn();
    const unwatch = otherAudioWatch()!(onChange);
    expect(watchOtherAudio).toHaveBeenLastCalledWith(true);
    window.__waveOtherAudio?.(true);
    expect(onChange).toHaveBeenCalledWith(true);
    unwatch();
    expect(watchOtherAudio).toHaveBeenLastCalledWith(false);
    expect(window.__waveOtherAudio).toBeUndefined();
  });
});
