import { describe, expect, it } from "vitest";
import type { Track } from "@/shared/types";
import { QueueMemory } from "./queueMemory";

const track = (id: string): Track => ({ id, title: id, artists: "", durationMs: 1, coverUrl: "", playCount: 0 });
const ids = (tracks: readonly Track[]) => tracks.map((item) => item.id);

describe("QueueMemory", () => {
  it("copies what it remembers, so later edits of the source don't leak in", () => {
    const source = [track("a"), track("b")];
    const memory = new QueueMemory();
    memory.remember(source, []);
    source.push(track("c"));
    expect(ids(memory.masterPlaylist)).toEqual(["a", "b"]);
  });

  it("appends to the context only when it knows one", () => {
    const memory = new QueueMemory();
    memory.append(track("x"), false);
    expect(memory.masterPlaylist).toEqual([]);
    memory.remember([track("a")], []);
    memory.append(track("x"), false);
    expect(ids(memory.masterPlaylist)).toEqual(["a", "x"]);
  });

  it("inserts a play-next track after the current one, or at the end when it is unknown", () => {
    const memory = new QueueMemory();
    memory.remember([track("a"), track("b"), track("c")], []);
    memory.insertNext(track("x"), track("a"), false);
    expect(ids(memory.masterPlaylist)).toEqual(["a", "x", "b", "c"]);
    memory.insertNext(track("y"), track("gone"), false);
    expect(ids(memory.masterPlaylist)).toEqual(["a", "x", "b", "c", "y"]);
  });

  it("keeps a shuffled queue's additions in its original order", () => {
    const memory = new QueueMemory();
    memory.setOriginalUpcoming([track("b")]);
    memory.append(track("z"), true);
    memory.insertNext(track("x"), null, true);
    expect(ids(memory.unshuffleReference())).toEqual(["x", "b", "z"]);
  });

  it("restores to the whole context when it knows one", () => {
    const memory = new QueueMemory();
    memory.remember([track("a"), track("b")], [track("b")]);
    expect(ids(memory.unshuffleReference())).toEqual(["a", "b"]);
    memory.clear();
    expect(memory.unshuffleReference()).toEqual([]);
  });
});
