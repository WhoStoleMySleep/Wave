import { api, mediaUrl, type CatalogTrack } from "@/shared/api";
import { waveDb } from "@/shared/storage";
import { usePlayerStore } from "@/features/player";
import { releaseSource, seekWhenLoaded } from "@/features/player/engine/audioElement";
import { fadeVolume } from "@/features/player/engine/audioFades";
import { loudnessGain } from "@/features/player/engine/streamSession";
import { log } from "@/shared/utils/logger";
import { START_FRACTION } from "./soundtrack";
import { TaskQueue } from "./taskQueue";

const CROSSFADE_MS = 900;
/** The server box has two cores and each stream costs it a yt-dlp run. */
const SERVER_STREAMS_AT_ONCE = 2;

const noop = () => {};

interface Source {
  url: string;
  loudnessDb: number | null | undefined;
}

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
 * fails leaves the music going rather than silent. Tracks saved on the device
 * play from there; only the rest are asked of the server.
 */
export class RecapAudio {
  private readonly sources = new Map<string, Promise<Source>>();
  private readonly objectUrls: string[] = [];
  private readonly server = new TaskQueue(SERVER_STREAMS_AT_ONCE);
  /** Tracks buffering at their start point, ready to play without a wait. */
  private readonly prepared = new Map<string, Voice>();
  private wanted = new Set<string>();
  private voice: Voice | null = null;
  /** Bumped by every play, so a stream that arrives late does not start over a newer one. */
  private epoch = 0;
  private paused = false;
  private muted = false;

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
    this.sources.clear();
    const urls = this.objectUrls.splice(0);
    if (urls.length > 0) setTimeout(() => urls.forEach((url) => URL.revokeObjectURL(url)), CROSSFADE_MS);
  }

  private async prepareOne(track: CatalogTrack): Promise<void> {
    if (this.voice?.trackId === track.id || this.prepared.has(track.id)) return;
    const source = await this.source(track.id).catch(() => null);
    if (!source || !this.wanted.has(track.id) || this.prepared.has(track.id) || this.voice?.trackId === track.id) return;
    this.prepared.set(track.id, this.createVoice(track, source));
  }

  private async readyVoice(track: CatalogTrack): Promise<Voice | null> {
    const prepared = this.prepared.get(track.id);
    if (prepared) {
      this.prepared.delete(track.id);
      return prepared;
    }
    try {
      return this.createVoice(track, await this.source(track.id, { urgent: true }));
    } catch (error) {
      log("yellow", "recap", `no stream for ${track.title}: ${String(error)}`);
      return null;
    }
  }

  private createVoice(track: CatalogTrack, source: Source): Voice {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "auto";
    audio.volume = 0;
    audio.src = source.url;
    const voice: Voice = { trackId: track.id, audio, gain: this.trackGain(source), stopFade: noop, retired: false };
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

  private trackGain(source: Source): number {
    return usePlayerStore.getState().normalizeVolume ? loudnessGain(source.loudnessDb) : 1;
  }

  /** @param urgent - the track is wanted now, so it goes ahead of the ones buffering for later slides */
  private source(trackId: string, { urgent = false } = {}): Promise<Source> {
    let source = this.sources.get(trackId);
    if (!source) {
      source = this.loadSource(trackId, urgent);
      source.catch(() => this.sources.delete(trackId));
      this.sources.set(trackId, source);
    }
    return source;
  }

  private async loadSource(trackId: string, urgent: boolean): Promise<Source> {
    const saved = await waveDb.getAudio(trackId).catch(() => null);
    if (saved) {
      const url = URL.createObjectURL(saved.blob);
      this.objectUrls.push(url);
      return { url, loudnessDb: saved.loudnessDb };
    }
    const session = await this.server.run(() => api.createPlaybackSession(trackId, undefined, { quiet: true }), { urgent });
    return { url: mediaUrl(session.streamUrl), loudnessDb: session.loudnessDb };
  }
}
