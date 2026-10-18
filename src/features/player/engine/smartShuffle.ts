import { log } from "@/shared/utils/logger";
import type { Track } from "@/shared/types";
import { usePlayerStore, type PlayerState } from "../store/playerStore";
import { isRadioContext } from "./playbackContext";
import { fetchRadioTracks } from "./wave";

const WINDOW = 8;
const HISTORY_LIMIT = 300;
const PICKS_PER_SEED = 10;
const LONG_RUN = 3;
const SHORT_RUN = 2;

export interface PlacementInput {
  queue: readonly Track[];
  currentIndex: number;
  seeds: readonly Track[];
  picks: ReadonlyMap<string, readonly Track[]>;
  known: ReadonlySet<string>;
}

export interface Placement {
  queue: Track[];
  placed: number;
}

/** Whether the track belongs to the playing list rather than the queue, the wave or smart shuffle. */
export function isContextTrack(track: Track | undefined): boolean {
  return track !== undefined && track.queueSource === undefined;
}

/**
 * Runs alternate between two and three context tracks by a hash of the track id,
 * so recomputing the slots on every track change lands on the same ones.
 */
export function closesSmartRun(track: Track, run: number): boolean {
  if (run >= LONG_RUN) return true;
  if (run < SHORT_RUN) return false;
  let hash = 0;
  for (let i = 0; i < track.id.length; i++) hash = (hash * 31 + track.id.charCodeAt(i)) | 0;
  return (hash & 1) === 0;
}

/** @returns context tracks within the window after which a pick belongs */
export function findSmartSeeds(queue: readonly Track[], currentIndex: number): Track[] {
  let run = countRunBack(queue, currentIndex);
  const seeds: Track[] = [];
  const end = Math.min(queue.length - 1, currentIndex + WINDOW);
  for (let i = currentIndex; i < end; i++) {
    const track = queue[i];
    if (i > currentIndex) run = isContextTrack(track) ? run + 1 : 0;
    if (!isContextTrack(track) || !isContextTrack(queue[i + 1])) continue;
    if (!closesSmartRun(track, run)) continue;
    seeds.push(track);
    run = 0;
  }
  return seeds;
}

function countRunBack(queue: readonly Track[], from: number): number {
  let run = 0;
  for (let i = from; i >= 0 && run < LONG_RUN && isContextTrack(queue[i]); i--) run++;
  return run;
}

export function knownIds(master: readonly Track[], queue: readonly Track[]): Set<string> {
  const ids = new Set<string>();
  for (const track of master) ids.add(track.id);
  for (const track of queue) ids.add(track.id);
  return ids;
}

/** Caps the ids so the radio request stays small. */
export function historyIds(known: ReadonlySet<string>, limit = HISTORY_LIMIT): string[] {
  const history: string[] = [];
  for (const id of known) {
    if (history.length >= limit) break;
    history.push(id);
  }
  return history;
}

/**
 * Puts a pick after every seed that is still upcoming and followed by a context track, in one pass.
 * Picks already queued or known to the context are skipped.
 */
export function placeSmartPicks({ queue, currentIndex, seeds, picks, known }: PlacementInput): Placement {
  const pending = new Set(seeds);
  const taken = new Set(known);
  for (const track of queue) taken.add(track.id);
  const result: Track[] = [];
  let placed = 0;
  queue.forEach((track, i) => {
    result.push(track);
    const isSeed = pending.delete(track);
    if (!isSeed || i < currentIndex || !isContextTrack(queue[i + 1])) return;
    const pick = picks.get(track.id)?.find((candidate) => !taken.has(candidate.id));
    if (!pick) return;
    taken.add(pick.id);
    result.push({ ...pick, queueSource: "smart" });
    placed++;
  });
  return { queue: result, placed };
}

/** @returns the queue without upcoming picks, or null when there are none */
export function stripSmartPicks(queue: readonly Track[], currentIndex: number): Track[] | null {
  const upcoming = queue.slice(currentIndex + 1);
  const kept = upcoming.filter((track) => track.queueSource !== "smart");
  if (kept.length === upcoming.length) return null;
  return [...queue.slice(0, currentIndex + 1), ...kept];
}

function isSmartShuffleActive(state: PlayerState): boolean {
  return state.smartShuffle && state.shuffle && !isRadioContext(state.playbackContext) && state.currentIndex >= 0;
}

export class SmartShuffle {
  private readonly picks = new Map<string, Track[]>();
  private filling = false;
  private refillRequested = false;

  constructor(
    private readonly getMasterPlaylist: () => readonly Track[],
    private readonly onPlaced: () => void,
  ) {}

  /** A call while a fill runs is folded into one more fill after it. */
  async fill(): Promise<void> {
    if (this.filling) {
      this.refillRequested = true;
      return;
    }
    const state = usePlayerStore.getState();
    if (!isSmartShuffleActive(state)) return;
    const seeds = findSmartSeeds(state.queue, state.currentIndex);
    if (seeds.length === 0) return;
    this.filling = true;
    try {
      await this.fillSeeds(seeds, state);
    } finally {
      this.finishFill();
    }
  }

  private async fillSeeds(seeds: Track[], state: PlayerState): Promise<void> {
    const known = knownIds(this.getMasterPlaylist(), state.queue);
    await this.fetchPicks(seeds, historyIds(known));
    const latest = usePlayerStore.getState();
    if (!latest.smartShuffle || latest.playbackContext !== state.playbackContext) return;
    const { queue, currentIndex } = latest;
    const placement = placeSmartPicks({ queue, currentIndex, seeds, picks: this.picks, known });
    if (placement.placed === 0) return;
    log("green", "radio", `smart shuffle placed ${placement.placed} picks`);
    usePlayerStore.setState({ queue: placement.queue });
    this.onPlaced();
  }

  private async fetchPicks(seeds: Track[], history: string[]): Promise<void> {
    const missing = seeds.filter((seed) => !this.picks.has(seed.id));
    await Promise.all(
      missing.map(async (seed) => {
        const tracks = await fetchRadioTracks(seed.id, { k: PICKS_PER_SEED, history }, "smart shuffle picks");
        this.picks.set(seed.id, tracks ?? []);
      }),
    );
  }

  private finishFill(): void {
    this.filling = false;
    if (!this.refillRequested) return;
    this.refillRequested = false;
    void this.fill();
  }
}
