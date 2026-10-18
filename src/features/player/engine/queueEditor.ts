import type { Track } from "@/shared/types";
import { usePlayerStore } from "../store/playerStore";
import type { QueueMemory } from "./queueMemory";
import { insertAfter, mergeContextOrder, moveItem, normalizeQueue } from "./queueOrder";

export interface QueueEditorDeps {
  memory: QueueMemory;
  onQueueChanged: () => void;
}

const store = () => usePlayerStore.getState();

export class QueueEditor {
  constructor(private readonly deps: QueueEditorDeps) {}

  public append(track: Track): void {
    const state = store();
    state.setQueue([...state.queue, track]);
    this.deps.memory.append(track, state.shuffle);
    this.deps.onQueueChanged();
  }

  public insertNext(track: Track): void {
    const state = store();
    state.setQueue(insertAfter(state.queue, state.currentIndex, track));
    this.deps.memory.insertNext(track, state.currentTrack, state.shuffle);
    this.deps.onQueueChanged();
  }

  /**
   * Follows a new sort of the playing list without restarting the current track.
   * Tracks queued by hand or by the wave stay right after the current one; a shuffled
   * queue keeps its order until shuffle is turned off.
   */
  public followContextOrder(tracks: Track[]): void {
    const state = store();
    const merged = mergeContextOrder(tracks, state.queue, state.currentIndex);
    if (!merged) return;
    const ordered = normalizeQueue(merged.queue, state.queue[state.currentIndex]);
    this.deps.memory.setMaster(ordered);
    if (state.shuffle) return;
    this.deps.memory.setOriginalUpcoming([]);
    usePlayerStore.setState({ queue: ordered, currentIndex: merged.index });
    this.deps.onQueueChanged();
  }

  public reorder(fromIndex: number, toIndex: number): void {
    const state = store();
    const moved = moveItem(state.queue, state.currentIndex, fromIndex, toIndex);
    if (!moved) return;
    usePlayerStore.setState({ queue: moved.queue, currentIndex: moved.index });
    this.deps.onQueueChanged();
  }

  public clear(): void {
    store().clearQueue();
    this.deps.memory.clear();
  }
}
