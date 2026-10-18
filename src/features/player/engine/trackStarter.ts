import { api, mediaUrl, type PlaybackSession } from "@/shared/api";
import { waveDb, type CachedAudioRecord } from "@/shared/storage";
import type { Track } from "@/shared/types";
import { log } from "@/shared/utils/logger";
import { usePlayerStore } from "../store/playerStore";
import { HAVE_ENOUGH_DATA, HAVE_FUTURE_DATA, seekWhenLoaded, waitForReadyState } from "./audioElement";
import type { AudioDeck } from "./audioDeck";
import { cacheWhenReady, type HeadStart, isCacheable } from "./audioDownload";
import { elapsedMs, errorMessage, kilobytes } from "./engineUtils";
import type { OutputLevel } from "./outputLevel";
import { loudnessGain, sessionExpiry } from "./streamSession";

const CAN_PLAY_TIMEOUT_MS = 3000;
const HEAD_START_MAX_MS = 10_000;

export interface LoadTicket {
  epoch: number;
  signal: AbortSignal;
  startPositionMs: number;
  crossfadeMs: number;
  releaseHeadStart: () => void;
  startedAt: number;
}

export interface StarterDeps {
  deck: AudioDeck;
  level: OutputLevel;
  headStart: HeadStart;
  latestEpoch: () => number;
  pendingStartMs: () => number;
  cacheSignal: () => AbortSignal | null;
}

const store = () => usePlayerStore.getState();

export function isLiveLoad(load: LoadTicket, latestEpoch: number): boolean {
  return load.epoch === latestEpoch && !load.signal.aborted;
}

function logStorageError(error: unknown): void {
  log("yellow", "cache", `storage update failed: ${errorMessage(error)}`);
}

export class TrackStarter {
  constructor(private readonly deps: StarterDeps) {}

  public async playCached(track: Track, record: CachedAudioRecord, load: LoadTicket): Promise<void> {
    load.releaseHeadStart();
    this.deps.level.setTrackGain(loudnessGain(record.loudnessDb));
    waveDb.putTrack(track).catch(logStorageError);
    waveDb.touchAudio(track.id).catch(logStorageError);
    this.attach(this.deps.deck.holdBlob(record.blob), load);
    log("cyan", "playback", `cache hit for "${track.title}" (${kilobytes(record.byteSize)} KB)`);
    const latencyMs = await this.startPlayback(load);
    if (latencyMs !== null) log("green", "playback", `started (cached): ${track.title} in ${latencyMs}ms`);
  }

  public async playStream(track: Track, load: LoadTicket): Promise<void> {
    const session = await api.createPlaybackSession(track.id, load.signal);
    if (!this.isLive(load)) {
      log("yellow", "playback", `superseded before the stream was ready (${track.title})`);
      return;
    }
    const url = this.attachStream(session, load);
    log("green", "playback", `stream attached: ${session.codec} ${session.bitrate} bps (${track.title})`);
    this.cacheInBackground(track, url, session);
    const latencyMs = await this.startPlayback(load);
    if (latencyMs !== null) log("green", "playback", `started: ${track.title} in ${latencyMs}ms`);
  }

  private attachStream(session: PlaybackSession, load: LoadTicket): string {
    const { deck, level } = this.deps;
    level.setTrackGain(loudnessGain(session.loudnessDb));
    const url = mediaUrl(session.streamUrl);
    this.attach(url, load);
    deck.setSessionExpiry(sessionExpiry(session));
    void waitForReadyState(deck.audio, HAVE_ENOUGH_DATA, HEAD_START_MAX_MS).then(load.releaseHeadStart);
    return url;
  }

  private attach(src: string, load: LoadTicket): void {
    const { audio } = this.deps.deck;
    audio.src = src;
    audio.volume = this.deps.level.startVolume();
    audio.load();
    const startMs = this.deps.pendingStartMs() || load.startPositionMs;
    if (startMs > 0) seekWhenLoaded(audio, startMs, () => load.epoch === this.deps.latestEpoch());
  }

  private async startPlayback(load: LoadTicket): Promise<number | null> {
    const { audio } = this.deps.deck;
    await waitForReadyState(audio, HAVE_FUTURE_DATA, CAN_PLAY_TIMEOUT_MS);
    if (!this.isLive(load)) return null;
    await audio.play();
    if (load.epoch === this.deps.latestEpoch()) this.markStarted(load);
    return elapsedMs(load.startedAt);
  }

  private markStarted(load: LoadTicket): void {
    store().setStatus("playing");
    this.deps.level.fadeIn(load.crossfadeMs);
  }

  private cacheInBackground(track: Track, url: string, session: PlaybackSession): void {
    const signal = this.deps.cacheSignal();
    if (!isCacheable(track) || !signal) return;
    void cacheWhenReady({ track, url, session, signal }, this.deps.headStart.ready);
  }

  private isLive(load: LoadTicket): boolean {
    return isLiveLoad(load, this.deps.latestEpoch());
  }
}
