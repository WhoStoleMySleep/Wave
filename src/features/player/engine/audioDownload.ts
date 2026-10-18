import type { PlaybackSession } from "@/shared/api";
import { audioCache, isCompleteAudioResponse, waveDb } from "@/shared/storage";
import type { Track } from "@/shared/types";
import { log } from "@/shared/utils/logger";
import { errorMessage, isAbortError, kilobytes } from "./engineUtils";

const FALLBACK_MIME_TYPE = "audio/webm";
const FULL_RANGE = "bytes=0-";
const MAX_CACHED_TRACK_MS = 20 * 60 * 1000;
const HEAD_START_MAX_MS = 10_000;

export interface SaveAudioRequest {
  track: Track;
  url: string;
  session: Pick<PlaybackSession, "mimeType" | "loudnessDb">;
  signal: AbortSignal;
}

/** A long mix would push dozens of regular tracks out of the cache. */
export function isCacheable(track: Track): boolean {
  return !track.durationMs || track.durationMs <= MAX_CACHED_TRACK_MS;
}

/**
 * Downloads the whole file and stores it for instant and offline replays.
 * @returns the stored size in bytes, or null when the response was partial or the download was cancelled
 */
export async function saveAudio({ track, url, session, signal }: SaveAudioRequest): Promise<number | null> {
  if (signal.aborted) return null;
  const response = await fetch(url, { headers: { Range: FULL_RANGE }, signal });
  if (!isCompleteAudioResponse(response)) return null;
  const data = await response.arrayBuffer();
  if (signal.aborted) return null;
  const mimeType = session.mimeType || response.headers.get("content-type") || FALLBACK_MIME_TYPE;
  const blob = new Blob([data], { type: mimeType });
  await waveDb.putAudio(track.id, blob, { mimeType, loudnessDb: session.loudnessDb });
  await waveDb.putTrack(track);
  audioCache.enforceCacheLimit().catch((error) => log("yellow", "cache", `cache trim failed: ${errorMessage(error)}`));
  return blob.size;
}

export class HeadStart {
  private gate: Promise<void> = Promise.resolve();

  public get ready(): Promise<void> {
    return this.gate;
  }

  /**
   * Holds downloads back until the playing stream has a buffer: on a phone a cache fill
   * and a preload beside it split the bandwidth and the track took ages to start.
   * @returns ends the head start early
   */
  public hold(): () => void {
    let release!: () => void;
    this.gate = new Promise<void>((resolve) => {
      release = resolve;
      setTimeout(resolve, HEAD_START_MAX_MS);
    });
    return release;
  }
}

/** Saves the playing stream once `ready` lets downloads go; a cancelled save stays quiet. */
export async function cacheWhenReady(request: SaveAudioRequest, ready: Promise<void>): Promise<void> {
  try {
    await ready;
    const size = await saveAudio(request);
    if (size !== null) log("green", "playback", `cached: ${request.track.title} (${kilobytes(size)} KB)`);
  } catch (error) {
    if (!isAbortError(error)) log("yellow", "playback", `caching "${request.track.title}" failed: ${errorMessage(error)}`);
  }
}
