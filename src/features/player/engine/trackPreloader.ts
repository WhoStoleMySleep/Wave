import { api, mediaUrl } from "@/shared/api";
import { waveDb } from "@/shared/storage";
import type { Track } from "@/shared/types";
import { log } from "@/shared/utils/logger";
import { saveAudio } from "./audioDownload";
import { errorMessage, isAbortError, kilobytes, renew } from "./engineUtils";

export interface PreloaderDeps {
  ready: () => Promise<void>;
  playingTrackId: () => string | null;
}

export class TrackPreloader {
  private controller: AbortController | null = null;
  private trackId: string | null = null;

  constructor(private readonly deps: PreloaderDeps) {}

  /** Downloads `track` into the cache once the playing stream has a buffer. */
  public async preload(track: Track): Promise<void> {
    if (!this.isWanted(track)) return;
    const cached = await waveDb.getAudio(track.id);
    if (cached || !this.isWanted(track)) return;
    this.controller = renew(this.controller);
    this.trackId = track.id;
    try {
      await this.download(track, this.controller.signal);
    } catch (error) {
      if (!isAbortError(error)) log("yellow", "preload", `"${track.title}" failed: ${errorMessage(error)}`);
    } finally {
      if (this.trackId === track.id) this.clear();
    }
  }

  /** A preload of the track being loaded is dropped: it fetches the whole file, the stream plays after the first chunk. */
  public clear(): void {
    this.controller?.abort();
    this.controller = null;
    this.trackId = null;
  }

  private isWanted(track: Track): boolean {
    return this.deps.playingTrackId() !== track.id && this.trackId !== track.id;
  }

  private async download(track: Track, signal: AbortSignal): Promise<void> {
    await this.deps.ready();
    if (signal.aborted) return;
    const session = await api.createPlaybackSession(track.id, signal);
    const size = await saveAudio({ track, url: mediaUrl(session.streamUrl), session, signal });
    if (size !== null) log("green", "preload", `preloaded: "${track.title}" (${kilobytes(size)} KB)`);
  }
}
