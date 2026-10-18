import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { api } from "@/shared/api";
import type { Track } from "@/shared/types";
import { PlaybackTelemetry } from "./playbackTelemetry";

const track = (durationMs = 100_000): Track => ({
  id: "t1",
  title: "Song",
  artists: "Artist",
  durationMs,
  coverUrl: "",
  playCount: 0,
});

describe("PlaybackTelemetry", () => {
  let send: MockInstance<typeof api.recordPlaybackEvent>;

  beforeEach(() => {
    vi.useFakeTimers();
    send = vi.spyOn(api, "recordPlaybackEvent").mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const play = (telemetry: PlaybackTelemetry, ms: number, stepMs = 1000) => {
    for (let elapsed = 0; elapsed < ms; elapsed += stepMs) {
      vi.advanceTimersByTime(stepMs);
      telemetry.onTick(true);
    }
  };

  it("reports a skip with the time actually heard and the context", () => {
    const telemetry = new PlaybackTelemetry();
    telemetry.startTrack(track(), "playlist:42");
    telemetry.onPlaying();
    play(telemetry, 10_000);
    telemetry.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({
      trackId: "t1",
      playedDurationMs: 10_000,
      completionRate: 0.1,
      skipped: true,
      completed: false,
      context: { type: "playlist", id: "42" },
    });
  });

  it("stays silent about a listen shorter than three seconds", () => {
    const telemetry = new PlaybackTelemetry();
    telemetry.startTrack(track(), null);
    telemetry.onPlaying();
    play(telemetry, 2000);
    telemetry.flush();
    expect(send).not.toHaveBeenCalled();
  });

  it("ignores a gap between ticks while the app slept", () => {
    const telemetry = new PlaybackTelemetry();
    telemetry.startTrack(track(), null);
    telemetry.onPlaying();
    play(telemetry, 4000);
    vi.advanceTimersByTime(60_000);
    telemetry.onTick(true);
    telemetry.flush();
    expect(send.mock.calls[0][0].playedDurationMs).toBe(4000);
  });

  it("reports a completed track as heard to the end with its loops", () => {
    const telemetry = new PlaybackTelemetry();
    telemetry.startTrack(track(1000), null);
    telemetry.onTrackCompleted(true);
    telemetry.recordSeekBackward();
    telemetry.startTrack(track(), null);
    expect(send.mock.calls[0][0]).toMatchObject({ completed: true, skipped: false, loopCount: 1, hasSeekBackward: true });
  });

  it("keeps one listening session across tracks", () => {
    const telemetry = new PlaybackTelemetry();
    for (let i = 0; i < 2; i++) {
      telemetry.startTrack(track(), null);
      telemetry.onPlaying();
      play(telemetry, 4000);
    }
    telemetry.flush();
    const [first, second] = send.mock.calls.map(([event]) => event);
    expect(first.listeningSessionId).toBe(second.listeningSessionId);
    expect(first.playbackSessionId).not.toBe(second.playbackSessionId);
  });
});
