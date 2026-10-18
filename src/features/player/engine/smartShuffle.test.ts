import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playerEngine, usePlayerStore } from "./playerEngine";
import { api } from "@/shared/api";
import type { Track } from "@/shared/types";
import {
  closesSmartRun,
  findSmartSeeds,
  historyIds,
  knownIds,
  placeSmartPicks,
  stripSmartPicks,
} from "./smartShuffle";

const track = (id: string): Track => ({
  id,
  title: `Track ${id}`,
  artists: "Artist",
  durationMs: 180000,
  coverUrl: "",
  playCount: 0,
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("smart shuffle", () => {
  beforeEach(() => {
    usePlayerStore.setState({
      status: "idle",
      queue: [],
      currentIndex: -1,
      currentTrack: null,
      shuffle: false,
      smartShuffle: false,
      autoplaySimilar: false,
      playbackContext: null,
      playbackContextTitle: null,
    });
    vi.spyOn(api, "getRadio").mockImplementation(async (seed: string) => ({
      items: [
        { id: seed, title: "seed", artists: [], durationMs: 1 },
        { id: `new-${seed}`, title: "pick", artists: [], durationMs: 1 },
      ],
    }));
  });

  afterEach(() => {
    playerEngine.setShuffle(false);
    vi.restoreAllMocks();
  });

  it("puts one new track after every two or three context tracks and takes them out when turned off", async () => {
    const tracks = Array.from({ length: 12 }, (_, i) => track(String(i)));
    await playerEngine.playTrack(tracks[0], tracks, { context: { id: "playlist:p1", title: "Mine" } });
    playerEngine.cycleShuffleMode();
    playerEngine.cycleShuffleMode();
    await flush();

    const state = usePlayerStore.getState();
    expect(state.shuffle).toBe(true);
    expect(state.smartShuffle).toBe(true);
    const sources = state.queue.map((t) => t.queueSource ?? "ctx");
    const picks = state.queue.filter((t) => t.queueSource === "smart");
    expect(picks.length).toBeGreaterThan(0);
    expect(picks.every((t) => t.id.startsWith("new-"))).toBe(true);

    let run = 0;
    for (const source of sources.slice(0, state.currentIndex + 9)) {
      if (source === "smart") {
        expect(run === 2 || run === 3).toBe(true);
        run = 0;
      } else {
        run++;
        expect(run).toBeLessThanOrEqual(3);
      }
    }

    playerEngine.cycleShuffleMode();
    const after = usePlayerStore.getState();
    expect(after.shuffle).toBe(false);
    expect(after.smartShuffle).toBe(false);
    expect(after.queue.some((t) => t.queueSource === "smart")).toBe(false);
    expect(after.queue.map((t) => t.id)).toEqual(tracks.map((t) => t.id));
  });

  it("is skipped on a station", async () => {
    await playerEngine.playTrack(track("a"), [track("a"), track("b")], { context: { id: "radio:a", title: "A" } });
    playerEngine.cycleShuffleMode();
    playerEngine.cycleShuffleMode();
    const state = usePlayerStore.getState();
    expect(state.shuffle).toBe(false);
    expect(state.smartShuffle).toBe(false);
  });

  it("keeps the context title when a queue row resends the same context id", async () => {
    const tracks = [track("1"), track("2")];
    await playerEngine.playTrack(tracks[0], tracks, { context: { id: "playlist:p1", title: "Mine" } });
    await playerEngine.playTrack(tracks[1], tracks, { context: "playlist:p1" });
    expect(usePlayerStore.getState().playbackContextTitle).toBe("Mine");
  });
});

describe("smart shuffle slots", () => {
  const smart = (id: string): Track => ({ ...track(id), queueSource: "smart" });

  it("closes a run at three for sure, never below two, and decides two by the track id", () => {
    expect(closesSmartRun(track("x"), 3)).toBe(true);
    expect(closesSmartRun(track("x"), 1)).toBe(false);
    const decisions = ["a", "b", "c", "d", "e", "f"].map((id) => closesSmartRun(track(id), 2));
    expect(decisions).toContain(true);
    expect(decisions).toContain(false);
    expect(closesSmartRun(track("a"), 2)).toBe(closesSmartRun(track("a"), 2));
  });

  it("seeds only context tracks followed by another context track", () => {
    const queue = [track("0"), track("1"), track("2"), smart("s"), track("3"), track("4"), track("5")];
    const seeds = findSmartSeeds(queue, 0);
    for (const seed of seeds) {
      const at = queue.indexOf(seed);
      expect(seed.queueSource).toBeUndefined();
      expect(queue[at + 1].queueSource).toBeUndefined();
    }
    expect(seeds.map((seed) => seed.id)).not.toContain("2");
  });

  it("finds no seeds in an empty queue", () => {
    expect(findSmartSeeds([], -1)).toEqual([]);
  });

  it("caps the history without losing ids the queue adds", () => {
    const known = knownIds([track("a"), track("b")], [track("b"), track("c")]);
    expect([...known]).toEqual(["a", "b", "c"]);
    expect(historyIds(known, 2)).toEqual(["a", "b"]);
    expect(historyIds(known, 10)).toEqual(["a", "b", "c"]);
  });

  it("places one new pick after each upcoming seed and skips known ones", () => {
    const queue = [track("0"), track("1"), track("2"), track("3")];
    const picks = new Map([
      ["1", [track("2"), track("n1")]],
      ["0", [track("n0")]],
    ]);
    const { queue: placed, placed: count } = placeSmartPicks({
      queue,
      currentIndex: 1,
      seeds: [queue[0], queue[1]],
      picks,
      known: new Set(),
    });
    expect(count).toBe(1);
    expect(placed.map((item) => item.id)).toEqual(["0", "1", "n1", "2", "3"]);
    expect(placed[2].queueSource).toBe("smart");
    expect(queue).toHaveLength(4);
  });

  it("doesn't use one pick twice", () => {
    const queue = [track("0"), track("1"), track("2"), track("3")];
    const picks = new Map([
      ["0", [track("n")]],
      ["2", [track("n")]],
    ]);
    const result = placeSmartPicks({ queue, currentIndex: 0, seeds: [queue[0], queue[2]], picks, known: new Set() });
    expect(result.placed).toBe(1);
  });

  it("takes out only upcoming picks", () => {
    const queue = [smart("p"), track("0"), smart("s"), track("1")];
    expect(stripSmartPicks(queue, 1)?.map((item) => item.id)).toEqual(["p", "0", "1"]);
    expect(stripSmartPicks([track("0"), track("1")], 0)).toBeNull();
  });
});
