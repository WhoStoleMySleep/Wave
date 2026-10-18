import { preloadCoverArt } from "@/features/covers";
import { waveDb } from "@/shared/storage";
import type { Track } from "@/shared/types";
import { log } from "@/shared/utils/logger";
import { usePlayerStore } from "../store/playerStore";
import { errorMessage } from "./engineUtils";
import type { LyricsLoader } from "./lyricsLoader";
import { playerRuntime } from "./playerRuntime";
import { upcomingTrack } from "./queueOrder";

const store = () => usePlayerStore.getState();

function warmUp(track: Track, lyrics: LyricsLoader): void {
  if (track.coverUrl) void preloadCoverArt(track.coverUrl);
  void lyrics.prefetch(track.id);
  waveDb.putTrack(track).catch((error) => log("yellow", "cache", `saving "${track.title}" failed: ${errorMessage(error)}`));
  void playerRuntime?.preloadTrack(track);
}

export class NextTrackPrefetch {
  private lastKey: string | null = null;

  constructor(private readonly lyrics: LyricsLoader) {}

  /** Lets the next `run` warm up again even when the pair looks the same. */
  public forget(): void {
    this.lastKey = null;
  }

  public run(): void {
    const state = store();
    const next = upcomingTrack(state);
    if (!next) {
      this.forget();
      return;
    }
    const key = `${state.currentTrack?.id ?? "none"}->${next.id}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    warmUp(next, this.lyrics);
  }
}
