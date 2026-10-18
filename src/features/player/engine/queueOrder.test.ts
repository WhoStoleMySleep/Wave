import { describe, expect, it } from "vitest";
import type { Track } from "@/shared/types";
import {
  hasPrevious,
  insertAfter,
  mergeContextOrder,
  moveItem,
  nextIndex,
  normalizeQueue,
  previousIndex,
  shuffle,
  shuffleUpcoming,
  unshuffleUpcoming,
  upcomingTrack,
} from "./queueOrder";

const track = (id: string, extra: Partial<Track> = {}): Track => ({
  id,
  title: id,
  artists: "Artist",
  durationMs: 1000,
  coverUrl: "",
  playCount: 0,
  ...extra,
});
const ids = (tracks: readonly Track[]) => tracks.map((item) => item.id);
const queueOf = (...list: string[]) => list.map((id) => track(id));

describe("shuffle", () => {
  it("keeps every item and leaves the input untouched", () => {
    const input = [1, 2, 3, 4, 5];
    const result = shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5]);
    expect([...result].sort()).toEqual(input);
  });

  it("handles an empty list", () => {
    expect(shuffle([])).toEqual([]);
  });
});

describe("shuffleUpcoming / unshuffleUpcoming", () => {
  it("shuffles only what comes after the current track and restores it", () => {
    const queue = queueOf("a", "b", "c", "d", "e");
    const { queue: shuffled, original } = shuffleUpcoming(queue, 1);
    expect(ids(shuffled.slice(0, 2))).toEqual(["a", "b"]);
    expect(ids(original)).toEqual(["c", "d", "e"]);
    expect(ids(unshuffleUpcoming(shuffled, 1, queue))).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("puts tracks the reference doesn't know at the end in their current order", () => {
    const queue = queueOf("a", "x", "d", "y", "c");
    const reference = queueOf("a", "b", "c", "d");
    expect(ids(unshuffleUpcoming(queue, 0, reference))).toEqual(["a", "c", "d", "x", "y"]);
  });

  it("keeps duplicates together at the first position of their id", () => {
    const queue = queueOf("a", "c", "b", "c");
    expect(ids(unshuffleUpcoming(queue, 0, queueOf("a", "b", "c")))).toEqual(["a", "b", "c", "c"]);
  });

  it("keeps the order as is without a reference", () => {
    const queue = queueOf("a", "c", "b");
    expect(ids(unshuffleUpcoming(queue, 0, []))).toEqual(["a", "c", "b"]);
  });
});

describe("normalizeQueue", () => {
  it("falls back to the selected track for a missing cover and zero for a missing duration", () => {
    const selected = track("s", { coverUrl: "cover.jpg" });
    const [item] = normalizeQueue([track("a", { coverUrl: "", durationMs: undefined })], selected);
    expect(item.coverUrl).toBe("cover.jpg");
    expect(item.durationMs).toBe(0);
  });

  it("makes a queue of just the selected track from an empty list", () => {
    expect(ids(normalizeQueue([], track("s")))).toEqual(["s"]);
  });
});

describe("insertAfter", () => {
  it("inserts right after the index without touching the input", () => {
    const queue = queueOf("a", "b");
    expect(ids(insertAfter(queue, 0, track("x")))).toEqual(["a", "x", "b"]);
    expect(ids(queue)).toEqual(["a", "b"]);
  });
});

describe("moveItem", () => {
  const queue = queueOf("1", "2", "3", "4");

  it("follows the current track when it is the moved one", () => {
    const moved = moveItem(queue, 1, 1, 3);
    expect(ids(moved!.queue)).toEqual(["1", "3", "4", "2"]);
    expect(moved!.index).toBe(3);
  });

  it("shifts the current index when a track crosses it", () => {
    expect(moveItem(queue, 2, 0, 3)!.index).toBe(1);
    expect(moveItem(queue, 1, 3, 0)!.index).toBe(2);
    expect(moveItem(queue, 0, 2, 3)!.index).toBe(0);
  });

  it("returns null for a move out of range or in place", () => {
    expect(moveItem(queue, 0, 0, 0)).toBeNull();
    expect(moveItem(queue, 0, -1, 1)).toBeNull();
    expect(moveItem(queue, 0, 0, 4)).toBeNull();
  });
});

describe("mergeContextOrder", () => {
  it("keeps hand-queued tracks right after the current one", () => {
    const queue = [...queueOf("1", "2"), track("q", { queueSource: "wave" }), ...queueOf("3", "4")];
    const merged = mergeContextOrder(queueOf("4", "3", "2", "1"), queue, 1);
    expect(ids(merged!.queue)).toEqual(["4", "3", "2", "q", "1"]);
    expect(merged!.index).toBe(2);
  });

  it("matches playlist rows by their item id so a repeated track keeps its row", () => {
    const queue = [track("a", { playlistItemId: "r1" }), track("a", { playlistItemId: "r2" })];
    const tracks = [track("a", { playlistItemId: "r2" }), track("a", { playlistItemId: "r1" })];
    expect(mergeContextOrder(tracks, queue, 1)!.index).toBe(0);
  });

  it("returns null when the current track left the list", () => {
    expect(mergeContextOrder(queueOf("x"), queueOf("a"), 0)).toBeNull();
    expect(mergeContextOrder([], queueOf("a"), 0)).toBeNull();
  });
});

describe("next / previous", () => {
  const queue = queueOf("a", "b", "c");

  it("stops at the end with repeat off and wraps with repeat all", () => {
    expect(nextIndex({ queue, currentIndex: 2, repeat: "off" })).toBeNull();
    expect(nextIndex({ queue, currentIndex: 2, repeat: "all" })).toBe(0);
    expect(nextIndex({ queue, currentIndex: 0, repeat: "off" })).toBe(1);
  });

  it("replays the track only when it ended by itself under repeat one", () => {
    expect(nextIndex({ queue, currentIndex: 1, repeat: "one" }, true)).toBe(1);
    expect(nextIndex({ queue, currentIndex: 1, repeat: "one" })).toBe(2);
  });

  it("has no next track in an empty queue", () => {
    expect(nextIndex({ queue: [], currentIndex: -1, repeat: "all" })).toBeNull();
  });

  it("stays on the first track unless the whole queue repeats", () => {
    expect(previousIndex({ queue, currentIndex: 0, repeat: "off" })).toBe(0);
    expect(previousIndex({ queue, currentIndex: 0, repeat: "all" })).toBe(2);
    expect(hasPrevious({ queue, currentIndex: 0, repeat: "off" })).toBe(false);
    expect(hasPrevious({ queue: queueOf("a"), currentIndex: 0, repeat: "all" })).toBe(false);
  });

  it("preloads the first track after the last one only when the queue repeats", () => {
    expect(upcomingTrack({ queue, currentIndex: 2, repeat: "off" })).toBeNull();
    expect(upcomingTrack({ queue, currentIndex: 2, repeat: "all" })?.id).toBe("a");
    expect(upcomingTrack({ queue, currentIndex: 0, repeat: "off" })?.id).toBe("b");
  });
});
