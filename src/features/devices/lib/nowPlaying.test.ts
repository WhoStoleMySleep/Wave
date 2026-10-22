import { describe, expect, it } from "vitest";
import { INITIAL_PLAYER_STATE, type PlayerState } from "@/features/player/store/playerStore";
import type { Track } from "@/shared/types";
import { handoffOf, parseDevices, snapshotOf, type NowPlaying, type RemoteDevice } from "./nowPlaying";

function track(id: string, durationMs = 200_000): Track {
  return { id, title: id, artists: "", durationMs, coverUrl: "", playCount: 0 };
}

function state(patch: Partial<PlayerState>): PlayerState {
  return { ...INITIAL_PLAYER_STATE, ...patch };
}

function device(nowPlaying: NowPlaying | null, ageMs = 0): RemoteDevice {
  return { deviceId: "phone", name: "Android", platform: "android", nowPlaying, ageMs };
}

const nowPlaying: NowPlaying = {
  queue: [track("a"), track("b")],
  index: 1,
  positionMs: 10_000,
  playing: true,
  context: "playlist:1",
  contextTitle: "Mix",
  contextCover: null,
  shuffle: false,
  repeat: "off",
};

describe("snapshotOf", () => {
  it("reports nothing while nothing is loaded", () => {
    expect(snapshotOf(state({ currentTrack: null }))).toBeNull();
  });

  it("sends a window of a long queue with the place inside it", () => {
    const queue = Array.from({ length: 1000 }, (_, i) => track(`t${i}`));
    const snapshot = snapshotOf(state({ queue, currentIndex: 500, currentTrack: queue[500], status: "playing" }))!;
    expect(snapshot.queue).toHaveLength(301);
    expect(snapshot.queue[snapshot.index].id).toBe("t500");
    expect(snapshot.playing).toBe(true);
  });

  it("sends the track alone when the queue does not hold it", () => {
    const snapshot = snapshotOf(state({ queue: [track("a")], currentIndex: 0, currentTrack: track("x") }))!;
    expect(snapshot.queue.map(({ id }) => id)).toEqual(["x"]);
    expect(snapshot.index).toBe(0);
  });
});

describe("handoffOf", () => {
  it("moves a playing track on by the report's age and the time since", () => {
    expect(handoffOf(device(nowPlaying, 1500), 500)?.positionMs).toBe(12_000);
  });

  it("keeps a paused track where it stopped", () => {
    expect(handoffOf(device({ ...nowPlaying, playing: false }, 60_000), 500)?.positionMs).toBe(10_000);
  });

  it("starts a track over when the time ran past its end", () => {
    expect(handoffOf(device(nowPlaying, 500_000), 0)?.positionMs).toBe(0);
  });

  it("gives nothing for a silent device", () => {
    expect(handoffOf(device(null), 0)).toBeNull();
  });
});

describe("parseDevices", () => {
  it("keeps good devices and drops what is broken", () => {
    const devices = parseDevices([
      { deviceId: "phone", name: "Android", platform: "android", nowPlaying, ageMs: 20 },
      { deviceId: "mac", nowPlaying: { queue: [], index: 0 } },
      { name: "no id" },
      "junk",
    ]);
    expect(devices).toEqual([
      device(nowPlaying, 20),
      { deviceId: "mac", name: "mac", platform: "desktop", nowPlaying: null, ageMs: 0 },
    ]);
  });

  it("reads anything but a list as no devices", () => {
    expect(parseDevices(null)).toEqual([]);
  });
});
