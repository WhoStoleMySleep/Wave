import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "@/shared/types";
import { usePlayerStore } from "../store/playerStore";
import { QueueEditor } from "./queueEditor";
import { QueueMemory } from "./queueMemory";

const track = (id: string): Track => ({ id, title: id, artists: "", durationMs: 1, coverUrl: "", playCount: 0 });
const ids = (tracks: readonly Track[]) => tracks.map((item) => item.id);
const queueIds = () => ids(usePlayerStore.getState().queue);

describe("QueueEditor", () => {
  let memory: QueueMemory;
  let changed = vi.fn<() => void>();
  let editor: QueueEditor;

  beforeEach(() => {
    const queue = [track("a"), track("b"), track("c")];
    usePlayerStore.setState({ queue, currentIndex: 0, currentTrack: queue[0], shuffle: false });
    memory = new QueueMemory();
    memory.remember(queue, []);
    changed = vi.fn();
    editor = new QueueEditor({ memory, onQueueChanged: changed });
  });

  it("appends to the queue and the remembered context", () => {
    editor.append(track("x"));
    expect(queueIds()).toEqual(["a", "b", "c", "x"]);
    expect(ids(memory.masterPlaylist)).toEqual(["a", "b", "c", "x"]);
    expect(changed).toHaveBeenCalled();
  });

  it("puts a play-next track right after the current one", () => {
    editor.insertNext(track("x"));
    expect(queueIds()).toEqual(["a", "x", "b", "c"]);
    expect(ids(memory.masterPlaylist)).toEqual(["a", "x", "b", "c"]);
  });

  it("moves a row and follows the current track", () => {
    editor.reorder(0, 2);
    expect(queueIds()).toEqual(["b", "c", "a"]);
    expect(usePlayerStore.getState().currentIndex).toBe(2);
  });

  it("follows a new order of the context without moving off the current track", () => {
    editor.followContextOrder([track("c"), track("b"), track("a")]);
    const state = usePlayerStore.getState();
    expect(state.queue[state.currentIndex].id).toBe("a");
    expect(ids(memory.masterPlaylist)).toEqual(queueIds());
  });

  it("keeps a shuffled queue as is when the context is re-sorted", () => {
    usePlayerStore.setState({ shuffle: true });
    editor.followContextOrder([track("c"), track("b"), track("a")]);
    expect(queueIds()).toEqual(["a", "b", "c"]);
    expect(changed).not.toHaveBeenCalled();
  });

  it("clears the queue down to the playing track and forgets the context", () => {
    editor.clear();
    expect(queueIds()).toEqual(["a"]);
    expect(memory.masterPlaylist).toEqual([]);
  });
});
