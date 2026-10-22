import { api, mediaUrl, type CatalogTrack, type PlaybackSession } from "@/shared/api";
import { usePlayerStore } from "@/features/player";
import { releaseSource, seekWhenLoaded } from "@/features/player/engine/audioElement";
import { fadeVolume } from "@/features/player/engine/audioFades";
import { loudnessGain } from "@/features/player/engine/streamSession";
import { log } from "@/shared/utils/logger";
import { START_FRACTION } from "./soundtrack";

const CROSSFADE_MS = 900;

const noop = () => {};

interface Voice {
  trackId: string;
  audio: HTMLAudioElement;
  gain: number;
  stopFade: () => void;
  /** Set once it fades out, so a play that resolves late does not bring it back. */
  retired: boolean;
}

/**
 * The recap's own music, apart from the player: the queue stays as it was and
 * nothing reaches the listening history, which only the player reports to.
 * The track before fades out only once the new one plays, so a stream that
 * fails leaves the music going rather than silent.
 */
export class RecapAudio {
  private readonly sessions = new Map<string, Promise<PlaybackSession>>();
  /** Tracks buffering at their start point, ready to play without a wait. */
  private readonly prepared = new Map<string, Voice>();
  private wanted = new Set<string>();
  private voice: Voice | null = null;
  /** Bumped by every play, so a stream that arrives late does not start over a newer one. */
  private epoch = 0;
  private paused = false;
  private muted = false;

  /** Asks for the streams ahead, so a slide starts its music without a wait. */
  prefetch(trackIds: string[]): void {
    trackIds.forEach((id) => void this.session(id).catch(noop));
  }

  /** Buffers these tracks ahead; buffers of tracks no longer near are let go. */
  prepare(tracks: CatalogTrack[]): void {
    this.wanted = new Set(tracks.map(({ id }) => id));
    for (const [id, voice] of this.prepared) {
      if (this.wanted.has(id)) continue;
      releaseSource(voice.audio);
      this.prepared.delete(id);
    }
    tracks.forEach((track) => void this.prepareOne(track));
  }

  async play(track: CatalogTrack): Promise<void> {
    if (this.voice?.trackId === track.id) return;
    const epoch = ++this.epoch;
    const voice = await this.readyVoice(track);
    if (!voice) return;
    if (epoch !== this.epoch) {
      releaseSource(voice.audio);
      return;
    }
    const previous = this.voice;
    this.voice = voice;
    if (this.paused) {
      this.retire(previous);
      return;
    }
    if (await this.start(voice)) this.retire(previous);
    else this.fallBack(voice, previous);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    const voice = this.voice;
    if (!voice) return;
    if (!paused) {
      void this.start(voice);
      return;
    }
    voice.stopFade();
    voice.audio.pause();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.voice) this.fadeTo(this.voice, this.target(this.voice));
  }

  /** Fades the music out and lets go of it and of every buffer; a play still waiting for its stream is dropped. */
  stop(): void {
    this.epoch++;
    this.retire(this.voice);
    this.voice = null;
    this.prepare([]);
  }

  private async prepareOne(track: CatalogTrack): Promise<void> {
    if (this.voice?.trackId === track.id || this.prepared.has(track.id)) return;
    const session = await this.session(track.id).catch(() => null);
    if (!session || !this.wanted.has(track.id) || this.prepared.has(track.id) || this.voice?.trackId === track.id) return;
    this.prepared.set(track.id, this.createVoice(track, session));
  }

  private async readyVoice(track: CatalogTrack): Promise<Voice | null> {
    const prepared = this.prepared.get(track.id);
    if (prepared) {
      this.prepared.delete(track.id);
      return prepared;
    }
    try {
      return this.createVoice(track, await this.session(track.id));
    } catch (error) {
      log("yellow", "recap", `no stream for ${track.title}: ${String(error)}`);
      return null;
    }
  }

  private createVoice(track: CatalogTrack, session: PlaybackSession): Voice {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "auto";
    audio.volume = 0;
    audio.src = mediaUrl(session.streamUrl);
    const voice: Voice = { trackId: track.id, audio, gain: this.trackGain(session), stopFade: noop, retired: false };
    seekWhenLoaded(audio, track.durationMs * START_FRACTION, () => !voice.retired);
    return voice;
  }

  /** @returns whether the track plays */
  private async start(voice: Voice): Promise<boolean> {
    try {
      await voice.audio.play();
      if (!voice.retired) this.fadeTo(voice, this.target(voice));
      return true;
    } catch (error) {
      log("yellow", "recap", `music did not start: ${String(error)}`);
      return false;
    }
  }

  /** A track that would not play gives way to the one before, unless another was asked for since. */
  private fallBack(failed: Voice, previous: Voice | null): void {
    releaseSource(failed.audio);
    if (this.voice === failed) this.voice = previous;
    else this.retire(previous);
  }

  private retire(voice: Voice | null): void {
    if (!voice || voice.retired) return;
    voice.retired = true;
    this.fadeTo(voice, 0, () => releaseSource(voice.audio));
  }

  private fadeTo(voice: Voice, target: number, onDone?: () => void): void {
    voice.stopFade();
    voice.stopFade = fadeVolume(voice.audio, target, onDone, CROSSFADE_MS);
  }

  private target(voice: Voice): number {
    return this.muted ? 0 : usePlayerStore.getState().volume * voice.gain;
  }

  private trackGain(session: PlaybackSession): number {
    return usePlayerStore.getState().normalizeVolume ? loudnessGain(session.loudnessDb) : 1;
  }

  private session(trackId: string): Promise<PlaybackSession> {
    let session = this.sessions.get(trackId);
    if (!session) {
      session = api.createPlaybackSession(trackId, undefined, { quiet: true });
      session.catch(() => this.sessions.delete(trackId));
      this.sessions.set(trackId, session);
    }
    return session;
  }
}
