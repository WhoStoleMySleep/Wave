import type { Track } from "@/shared/types";
import { log } from "@/shared/utils/logger";
import { usePlayerStore, type PlayerState } from "../store/playerStore";
import { createId } from "./engineUtils";
import { isRadioContext } from "./playbackContext";
import { describeSample, fetchRadioTracks } from "./wave";

const WAVE_APPEND_DEBOUNCE_MS = 400;
const STATION_SIZE = 20;
const WAVE_SIZE = 20;
const WAVE_HISTORY_SIZE = 20;
const WAVE_ID_LOG_LENGTH = 8;

export interface WaveDeps {
  session: () => number;
  onQueueGrown: () => void;
}

const store = () => usePlayerStore.getState();

/** Tracks of the wave not queued yet, marked as wave picks unless the context is itself a station. */
export function waveAdditions(tracks: readonly Track[], state: Pick<PlayerState, "queue" | "playbackContext">): Track[] {
  const queued = new Set(state.queue.map((track) => track.id));
  const queueSource: Track["queueSource"] = isRadioContext(state.playbackContext) ? undefined : "wave";
  return tracks.filter((track) => !queued.has(track.id)).map((track) => ({ ...track, queueSource }));
}

export class WaveFeed {
  private waveId = createId("wave");
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: WaveDeps) {}

  /** Starts a new wave, so the radio doesn't avoid tracks of the previous one. */
  public restart(): void {
    this.waveId = createId("wave");
  }

  /** @returns tracks for a station on `seed` without the seed, or null when the radio failed or playback moved on */
  public async fetchStation(seed: Track): Promise<Track[] | null> {
    const session = this.deps.session();
    const tracks = await fetchRadioTracks(seed.id, { k: STATION_SIZE, wave_id: this.waveId }, "radio fetch");
    if (!tracks || session !== this.deps.session()) return null;
    return tracks.filter((track) => track.id !== seed.id);
  }

  /** Debounced, so skipping through the end of the queue asks the radio once. */
  public extendIfLast(index: number, seedId: string): void {
    if (index !== store().queue.length - 1) return;
    const session = this.deps.session();
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.append(session, seedId), WAVE_APPEND_DEBOUNCE_MS);
  }

  private async append(session: number, seedId: string): Promise<void> {
    const state = store();
    if (!state.autoplaySimilar) return;
    const history = state.queue.slice(-WAVE_HISTORY_SIZE).map((track) => track.id);
    const waveId = this.waveId;
    const tracks = await fetchRadioTracks(seedId, { history, k: WAVE_SIZE, wave_id: waveId }, "similar tracks fetch");
    const latest = store();
    if (!tracks || session !== this.deps.session() || !latest.autoplaySimilar) return;
    const additions = waveAdditions(tracks, latest);
    if (additions.length === 0) return;
    log("green", "radio", `appending ${additions.length} wave tracks (wave=${waveId.slice(0, WAVE_ID_LOG_LENGTH)}): [${describeSample(additions)}]`);
    latest.setQueue([...latest.queue, ...additions]);
    this.deps.onQueueGrown();
  }
}
