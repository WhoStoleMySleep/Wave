import { waveDb } from "@/shared/storage";
import type { Track } from "@/shared/types";
import { log } from "@/shared/utils/logger";
import { otherAudioWatch } from "@/platform/otherAudio";
import { usePlayerStore, type PlayerState } from "../store/playerStore";
import { installAndroidMediaSync } from "./androidMediaSync";
import { AudioDeck } from "./audioDeck";
import { installAudioDucking } from "./audioDucking";
import { hasSource, seekWhenLoaded } from "./audioElement";
import { HeadStart } from "./audioDownload";
import { crossfadeMs, isCrossfadeDue } from "./crossfade";
import { errorMessage, renew } from "./engineUtils";
import type { PlaybackFailure } from "./failureGuard";
import { isRealEnd, knownDurationMs, mediaErrorInfo, positionMs, type MediaHandlers } from "./mediaEvents";
import { OutputLevel } from "./outputLevel";
import { classifyPlayError, isNotOnYoutube, logPlaybackFailure } from "./playFailures";
import { installMediaSessionHandlers, showMediaMetadata, watchOutputDevices } from "./systemMedia";
import { TrackPreloader } from "./trackPreloader";
import { isLiveLoad, type LoadTicket, TrackStarter } from "./trackStarter";

const MAX_RECOVERY_ATTEMPTS = 1;

const store = () => usePlayerStore.getState();

function volumeChanged(state: PlayerState, prev: PlayerState): boolean {
  return state.volume !== prev.volume || state.normalizeVolume !== prev.normalizeVolume;
}

export class PlayerRuntime {
  private currentTrackId: string | null = null;
  private loadEpoch = 0;
  private loadController: AbortController | null = null;
  private cacheController: AbortController | null = null;
  private pendingStartMs = 0;
  private recoveryAttempts = 0;
  private crossfadeArmed = false;
  private handoffPending = false;
  private readonly mediaHandlers: MediaHandlers = {
    timeupdate: (audio) => this.handleTimeUpdate(audio),
    durationchange: (audio) => this.handleDurationChange(audio),
    waiting: () => this.handleWaiting(),
    ended: (audio) => this.handleEnded(audio),
    playing: (audio) => this.handlePlaying(audio),
    pause: (audio) => this.handlePause(audio),
    error: (audio) => this.handleMediaError(audio),
  };
  private readonly deck = new AudioDeck(this.mediaHandlers);
  private readonly headStart = new HeadStart();
  private readonly level = new OutputLevel(() => this.audio);
  private readonly preloader = new TrackPreloader({
    ready: () => this.headStart.ready,
    playingTrackId: () => this.currentTrackId,
  });
  private readonly starter = new TrackStarter({
    deck: this.deck,
    level: this.level,
    headStart: this.headStart,
    latestEpoch: () => this.loadEpoch,
    pendingStartMs: () => this.pendingStartMs,
    cacheSignal: () => this.cacheController?.signal ?? null,
  });
  public onEnded?: () => void;
  public onError?: (failure: PlaybackFailure) => void;

  constructor() {
    this.audio.volume = this.level.target();
    usePlayerStore.subscribe((state, prev) => this.followSettings(state, prev));
    watchOutputDevices(() => this.pauseForDeviceChange());
    installMediaSessionHandlers((command) => store().dispatch(command));
    installAndroidMediaSync();
    installAudioDucking(this.level, () => this.audio, otherAudioWatch());
    log("green", "boot", `player runtime initialized, volume ${this.audio.volume}`);
  }

  private get audio(): HTMLAudioElement {
    return this.deck.audio;
  }

  public getCurrentTrackId(): string | null {
    return this.currentTrackId;
  }

  /** @returns where the element actually is, or null before it has a time to report */
  public getPositionMs(): number | null {
    return positionMs(this.audio);
  }

  public hasLoadedSourceFor(trackId: string): boolean {
    return this.currentTrackId === trackId && this.deck.hasPlayableSource();
  }

  /**
   * Plays `track` from the cache or a fresh stream; a newer call supersedes an older one.
   * @param bypassCache - go to the stream, which also replaces a broken cached copy
   */
  public async loadAndPlay(track: Track, startPositionMs = 0, { bypassCache = false } = {}): Promise<void> {
    const load = this.beginLoad(track, startPositionMs);
    try {
      const cached = bypassCache ? null : await waveDb.getAudio(track.id);
      if (!isLiveLoad(load, this.loadEpoch)) return;
      if (cached) await this.starter.playCached(track, cached, load);
      else await this.starter.playStream(track, load);
    } catch (error) {
      this.failLoad(track, error, load);
    }
  }

  /** Downloads the next track into the cache once the playing stream has a buffer. */
  public preloadTrack(track: Track): Promise<void> {
    return this.preloader.preload(track);
  }

  public cancelPendingLoad(): void {
    this.loadEpoch += 1;
    this.loadController?.abort();
    this.cacheController?.abort();
    this.currentTrackId = null;
    this.recoveryAttempts = 0;
    this.resetElement();
    store().setStatus("paused");
    log("cyan", "playback", "pending load cancelled");
  }

  public setPendingSeek(positionMs: number): void {
    this.pendingStartMs = positionMs;
    store().setPosition(positionMs);
    this.seek(positionMs);
  }

  public seek(positionMs: number): void {
    if (hasSource(this.audio)) seekWhenLoaded(this.audio, positionMs);
  }

  public pause(): void {
    const epoch = this.interrupt();
    store().setStatus("paused");
    log("cyan", "audio", "pause requested");
    this.deck.dropRetired();
    this.level.fadeTo(0, () => this.pauseIfCurrent(epoch));
  }

  /** Resumes on the element, or reloads the track when its stream expired or broke. */
  public resume(): void {
    const epoch = this.interrupt();
    store().setStatus("playing");
    log("cyan", "audio", "resume requested");
    const track = store().currentTrack;
    if (track && !this.deck.hasPlayableSource()) {
      void this.loadAndPlay(track, store().positionMs);
      return;
    }
    if (this.audio.paused) void this.playFromPause(epoch, track);
    else this.level.fadeTo(this.level.target());
  }

  private async playFromPause(epoch: number, track: Track | null): Promise<void> {
    this.audio.volume = this.level.startVolume();
    try {
      await this.audio.play();
    } catch (error) {
      this.resumeFailed(error, epoch, track);
      return;
    }
    if (epoch === this.loadEpoch) this.level.fadeTo(this.level.target());
  }

  private pauseIfCurrent(epoch: number): void {
    if (epoch === this.loadEpoch) this.audio.pause();
  }

  private handleTimeUpdate(audio: HTMLAudioElement): void {
    const position = positionMs(audio);
    if (!this.currentTrackId || store().status === "loading" || position === null) return;
    store().setPosition(position);
    if (this.crossfadeArmed && isCrossfadeDue(audio, store())) this.startCrossfade();
  }

  private handleDurationChange(audio: HTMLAudioElement): void {
    const durationMs = knownDurationMs(audio);
    if (this.currentTrackId && durationMs !== null) store().setDuration(durationMs);
  }

  private handleWaiting(): void {
    log("yellow", "audio", "buffering");
    if (store().status === "playing") store().setStatus("loading");
  }

  private handleEnded(audio: HTMLAudioElement): void {
    if (!this.currentTrackId || !isRealEnd(audio)) return;
    log("cyan", "audio", "ended, skipping to next");
    this.finishTrack();
  }

  private handlePlaying(audio: HTMLAudioElement): void {
    log("green", "audio", "playing");
    if (!this.currentTrackId || audio.paused || store().status === "paused") return;
    store().setStatus("playing");
  }

  /** The end of a track fires `pause` before `ended`; as a pause it would let Android freeze the app in between. */
  private handlePause(audio: HTMLAudioElement): void {
    if (audio.ended) return;
    log("cyan", "audio", "paused");
    if (store().status === "playing") store().setStatus("paused");
  }

  private handleMediaError(audio: HTMLAudioElement): void {
    const trackId = this.currentTrackId;
    if (!trackId || !hasSource(audio)) return;
    const { code, message } = mediaErrorInfo(audio);
    log("red", "audio", `error (code ${code}): ${message}`);
    const recoverable = this.recoverableTrack();
    if (recoverable) {
      this.recover(recoverable);
      return;
    }
    store().setStatus("error", message);
    this.onError?.({ trackId, message });
  }

  private recoverableTrack(): Track | null {
    const { currentTrack } = store();
    if (currentTrack?.id !== this.currentTrackId || this.recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) return null;
    return currentTrack;
  }

  /** A cached file that failed will fail again, so recovery goes to the stream, which also replaces the bad copy. */
  private recover(track: Track): void {
    this.recoveryAttempts += 1;
    const bypassCache = this.deck.isPlayingBlob;
    const { positionMs } = store();
    log("yellow", "playback", `recovering via ${bypassCache ? "stream" : "cache or stream"} at ${positionMs}ms`);
    void this.loadAndPlay(track, positionMs, { bypassCache });
  }

  private finishTrack(): void {
    this.onEnded?.();
    store().dispatch({ type: "SKIP_NEXT", isAutoEnd: true });
  }

  private startCrossfade(): void {
    this.crossfadeArmed = false;
    this.handoffPending = true;
    log("cyan", "audio", `crossfading over ${store().crossfadeSeconds}s`);
    this.finishTrack();
    this.handoffPending = false;
  }

  private beginLoad(track: Track, startPositionMs: number): LoadTicket {
    const handoff = this.handoffPending;
    this.handoffPending = false;
    this.pendingStartMs = startPositionMs;
    this.preloader.clear();
    this.loadController = renew(this.loadController);
    this.cacheController = renew(this.cacheController);
    this.enterTrack(track, startPositionMs);
    this.swapElement(handoff);
    return {
      epoch: ++this.loadEpoch,
      signal: this.loadController.signal,
      startPositionMs,
      crossfadeMs: handoff ? crossfadeMs(store()) : 0,
      releaseHeadStart: this.headStart.hold(),
      startedAt: performance.now(),
    };
  }

  private enterTrack(track: Track, startPositionMs: number): void {
    if (this.currentTrackId !== track.id) this.recoveryAttempts = 0;
    this.currentTrackId = track.id;
    showMediaMetadata(track);
    store().setStatus("loading", null);
    store().setPosition(Math.max(0, startPositionMs));
  }

  private swapElement(handoff: boolean): void {
    this.level.stopFade();
    if (handoff) this.deck.handOff();
    else this.deck.dropRetired();
    this.resetElement();
    this.crossfadeArmed = true;
  }

  private resetElement(): void {
    this.level.stopFade();
    this.deck.reset();
  }

  private failLoad(track: Track, error: unknown, load: LoadTicket): void {
    if (!isLiveLoad(load, this.loadEpoch)) return;
    const kind = classifyPlayError(error);
    if (kind === "superseded") return;
    if (kind === "blocked") {
      this.waitForGesture();
      return;
    }
    logPlaybackFailure(track, error);
    const message = errorMessage(error);
    store().setStatus("error", message);
    this.onError?.({ trackId: track.id, message, notOnYoutube: isNotOnYoutube(error) });
  }

  private resumeFailed(error: unknown, epoch: number, track: Track | null): void {
    const kind = classifyPlayError(error);
    if (epoch !== this.loadEpoch || kind === "superseded") return;
    if (kind === "blocked") {
      this.waitForGesture();
      return;
    }
    log("red", "audio", `play failed: ${errorMessage(error)}`);
    if (track && this.recoveryAttempts < MAX_RECOVERY_ATTEMPTS) this.recover(track);
    else store().setStatus("paused");
  }

  private waitForGesture(): void {
    log("yellow", "playback", "autoplay blocked, waiting for a user gesture");
    store().setStatus("paused");
  }

  private interrupt(): number {
    this.loadController?.abort();
    this.loadController = null;
    return ++this.loadEpoch;
  }

  private followSettings(state: PlayerState, prev: PlayerState): void {
    if (volumeChanged(state, prev)) this.level.follow();
  }

  private pauseForDeviceChange(): void {
    const { pauseOnDeviceChange, status } = store();
    if (pauseOnDeviceChange && !this.audio.paused && status === "playing") this.pause();
  }
}

export const playerRuntime = typeof window !== "undefined" ? new PlayerRuntime() : null;
