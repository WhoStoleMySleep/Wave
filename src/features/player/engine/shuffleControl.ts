import { usePlayerStore, type PlayerState } from "../store/playerStore";
import { isRadioContext } from "./playbackContext";
import type { QueueMemory } from "./queueMemory";
import { shuffleUpcoming, unshuffleUpcoming } from "./queueOrder";
import { stripSmartPicks, type SmartShuffle } from "./smartShuffle";

export interface ShuffleDeps {
  memory: QueueMemory;
  smartSlots: SmartShuffle;
  onQueueChanged: () => void;
}

const store = () => usePlayerStore.getState();

export class ShuffleControl {
  constructor(private readonly deps: ShuffleDeps) {}

  /** Turning shuffle off also ends smart shuffle. */
  public setShuffle(enabled: boolean): void {
    if (!enabled) this.setSmartShuffle(false);
    const state = store();
    if (state.shuffle === enabled) return;
    state.setShuffle(enabled);
    if (state.queue.length === 0 || state.currentIndex < 0) return;
    if (enabled) this.shuffleQueue(state);
    else this.unshuffleQueue(state);
    this.deps.onQueueChanged();
  }

  /** Turning it off takes the upcoming picks out of the queue. */
  public setSmartShuffle(enabled: boolean): void {
    if (enabled) {
      this.enableSmartShuffle();
      return;
    }
    const state = store();
    if (!state.smartShuffle) return;
    state.setSmartShuffle(false);
    const queue = stripSmartPicks(state.queue, state.currentIndex);
    if (!queue) return;
    usePlayerStore.setState({ queue });
    this.deps.onQueueChanged();
  }

  /** Cycles off → shuffle → smart shuffle; a station skips smart shuffle. */
  public cycle(): void {
    const { shuffle, smartShuffle, playbackContext } = store();
    if (!shuffle) this.setShuffle(true);
    else if (!smartShuffle && !isRadioContext(playbackContext)) this.setSmartShuffle(true);
    else this.setShuffle(false);
  }

  private enableSmartShuffle(): void {
    if (isRadioContext(store().playbackContext)) return;
    this.setShuffle(true);
    store().setSmartShuffle(true);
    void this.deps.smartSlots.fill();
  }

  private shuffleQueue({ queue, currentIndex }: PlayerState): void {
    const shuffled = shuffleUpcoming(queue, currentIndex);
    this.deps.memory.setOriginalUpcoming(shuffled.original);
    store().setQueue(shuffled.queue);
  }

  private unshuffleQueue({ queue, currentIndex }: PlayerState): void {
    store().setQueue(unshuffleUpcoming(queue, currentIndex, this.deps.memory.unshuffleReference()));
    this.deps.memory.setOriginalUpcoming([]);
  }
}
