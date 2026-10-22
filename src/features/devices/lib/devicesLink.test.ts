import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore } from "@/features/player/store/playerStore";
import type { PresenceMessage } from "@/shared/presence";
import type { Track } from "@/shared/types";
import { useDevicesStore } from "../store/devicesStore";
import type { NowPlaying } from "./nowPlaying";

const presence = vi.hoisted(() => ({
  sent: [] as object[],
  message: (_: PresenceMessage) => {},
  connected: () => {},
  disconnected: () => {},
}));

const engine = vi.hoisted(() => ({ pause: vi.fn(), takeOver: vi.fn() }));

vi.mock("@/shared/presence", () => ({
  presenceClient: {
    send: (message: object) => presence.sent.push(message) > 0,
    onMessage: (listener: (message: PresenceMessage) => void) => ((presence.message = listener), () => {}),
    onConnected: (listener: () => void) => ((presence.connected = listener), () => {}),
    onDisconnected: (listener: () => void) => ((presence.disconnected = listener), () => {}),
  },
}));

vi.mock("@/features/player", async () => ({
  usePlayerStore: (await import("@/features/player/store/playerStore")).usePlayerStore,
  playerEngine: engine,
}));

const { DevicesLink } = await import("./devicesLink");

function track(id: string): Track {
  return { id, title: id, artists: "", durationMs: 200_000, coverUrl: "", playCount: 0 };
}

const remote: NowPlaying = {
  queue: [track("a")],
  index: 0,
  positionMs: 30_000,
  playing: true,
  context: null,
  contextTitle: null,
  contextCover: null,
  shuffle: true,
  repeat: "all",
};

function reports(): unknown[] {
  return presence.sent.filter((message) => (message as { type: string }).type === "nowPlaying");
}

describe("DevicesLink", () => {
  let stop: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    presence.sent = [];
    usePlayerStore.setState({ queue: [track("a")], currentIndex: 0, currentTrack: track("a"), status: "playing", positionMs: 0 });
    useDevicesStore.setState({ devices: [], receivedAt: 0 });
    stop = new DevicesLink().start();
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("reports what plays at start and again after each reconnect", () => {
    expect(reports()).toHaveLength(1);
    presence.connected();
    expect(reports()).toHaveLength(2);
  });

  it("reports a new track and a pause, but not the position moving on", () => {
    vi.advanceTimersByTime(1000);
    usePlayerStore.setState({ positionMs: 1000 });
    expect(reports()).toHaveLength(1);
    usePlayerStore.setState({ status: "paused" });
    usePlayerStore.setState({ currentTrack: track("b"), queue: [track("b")] });
    expect(reports()).toHaveLength(3);
  });

  it("reports a seek", () => {
    usePlayerStore.setState({ positionMs: 90_000 });
    expect(reports()).toHaveLength(2);
  });

  it("keeps the other devices and forgets them when the socket goes", () => {
    presence.message({ type: "devices", devices: [{ deviceId: "phone", name: "Android", platform: "android" }] });
    expect(useDevicesStore.getState().devices.map(({ deviceId }) => deviceId)).toEqual(["phone"]);
    presence.disconnected();
    expect(useDevicesStore.getState().devices).toEqual([]);
  });

  it("pauses when another device took over", () => {
    presence.message({ type: "pause" });
    expect(engine.pause).toHaveBeenCalled();
  });

  it("takes over from where the other device is by now and pauses it there", () => {
    presence.message({ type: "devices", devices: [{ deviceId: "phone", name: "Android", platform: "android", nowPlaying: remote, ageMs: 1000 }] });
    vi.advanceTimersByTime(2000);
    new DevicesLink().takeOver(useDevicesStore.getState().devices[0]);
    expect(engine.takeOver).toHaveBeenCalledWith(expect.objectContaining({ positionMs: 33_000, shuffle: true, repeat: "all" }));
    expect(presence.sent.at(-1)).toEqual({ type: "pause", deviceId: "phone" });
  });
});
