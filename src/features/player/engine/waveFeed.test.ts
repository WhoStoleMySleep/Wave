import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/shared/api";
import type { Track } from "@/shared/types";
import { usePlayerStore } from "../store/playerStore";
import { WaveFeed, waveAdditions } from "./waveFeed";

const track = (id: string): Track => ({ id, title: id, artists: "", durationMs: 1, coverUrl: "", playCount: 0 });
const radio = (...ids: string[]) => ({ items: ids.map((id) => ({ id, title: id, artists: [], durationMs: 1 })) });

describe("waveAdditions", () => {
  it("drops queued tracks and marks the rest as wave picks", () => {
    const additions = waveAdditions([track("a"), track("n")], { queue: [track("a")], playbackContext: "album:1" });
    expect(additions.map((item) => [item.id, item.queueSource])).toEqual([["n", "wave"]]);
  });

  it("leaves tracks unmarked on a station", () => {
    const additions = waveAdditions([track("n")], { queue: [], playbackContext: "radio:seed" });
    expect(additions[0].queueSource).toBeUndefined();
  });
});

describe("WaveFeed", () => {
  let session: number;
  let grown = vi.fn<() => void>();
  let feed: WaveFeed;

  beforeEach(() => {
    session = 1;
    grown = vi.fn();
    feed = new WaveFeed({ session: () => session, onQueueGrown: grown });
    usePlayerStore.setState({ queue: [track("a")], currentIndex: 0, autoplaySimilar: true, playbackContext: null });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns a station without its seed", async () => {
    vi.spyOn(api, "getRadio").mockResolvedValue(radio("seed", "b") as never);
    expect((await feed.fetchStation(track("seed")))?.map((item) => item.id)).toEqual(["b"]);
  });

  it("drops a station that arrives after playback moved on", async () => {
    vi.spyOn(api, "getRadio").mockImplementation(async () => {
      session = 2;
      return radio("b") as never;
    });
    expect(await feed.fetchStation(track("seed"))).toBeNull();
  });

  it("appends the wave after the last track once the debounce passes", async () => {
    vi.useFakeTimers();
    const getRadio = vi.spyOn(api, "getRadio").mockResolvedValue(radio("a", "b") as never);
    feed.extendIfLast(0, "a");
    feed.extendIfLast(0, "a");
    await vi.advanceTimersByTimeAsync(400);
    expect(getRadio).toHaveBeenCalledTimes(1);
    expect(usePlayerStore.getState().queue.map((item) => item.id)).toEqual(["a", "b"]);
    expect(grown).toHaveBeenCalled();
  });

  it("does not extend a queue with tracks still ahead", async () => {
    vi.useFakeTimers();
    usePlayerStore.setState({ queue: [track("a"), track("b")] });
    const getRadio = vi.spyOn(api, "getRadio");
    feed.extendIfLast(0, "a");
    await vi.advanceTimersByTimeAsync(400);
    expect(getRadio).not.toHaveBeenCalled();
  });
});
