import { useSyncExternalStore } from "react";
import { playerEngine, type PlayerState } from "../engine/playerEngine";
import { INITIAL_PLAYER_STATE } from "../store/playerDefaults";

const subscribe = (onStoreChange: () => void) => playerEngine.subscribe(onStoreChange);
const getSnapshot = () => playerEngine.getSnapshot();
const getServerSnapshot = () => INITIAL_PLAYER_STATE;

function changedBesidesPosition(next: PlayerState, prev: PlayerState): boolean {
  for (const key in next) {
    if (key === "positionMs") continue;
    if (next[key as keyof PlayerState] !== prev[key as keyof PlayerState]) return true;
  }
  return false;
}

let positionlessSnapshot: PlayerState | null = null;

/**
 * Every subscriber is notified; React skips the render because this snapshot keeps its identity
 * while only the position moves. Filtering in the listener against this shared snapshot would
 * starve every component but the first: it refreshes the snapshot, and the rest see no change.
 */
const getSnapshotWithoutPosition = () => {
  const next = getSnapshot();
  if (!positionlessSnapshot || changedBesidesPosition(next, positionlessSnapshot)) {
    positionlessSnapshot = next;
  }
  return positionlessSnapshot;
};

/**
 * Player state for a component. Position ticks several times a second while a
 * track plays, so a component that leaves it out with `position: false` skips
 * those renders; its `positionMs` is then only as fresh as the last other change.
 */
export function usePlayerState({ position = true }: { position?: boolean } = {}): PlayerState {
  return useSyncExternalStore(
    subscribe,
    position ? getSnapshot : getSnapshotWithoutPosition,
    getServerSnapshot,
  );
}

/** Current playback position, for the small parts of a view that show it. */
export function usePlaybackPosition(): number {
  return useSyncExternalStore(
    subscribe,
    () => getSnapshot().positionMs,
    () => 0,
  );
}
