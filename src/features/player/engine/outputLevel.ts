import { usePlayerStore } from "../store/playerStore";
import { FADE_FLOOR, fadeInAlongPlayback, fadeVolume, isPageHidden } from "./audioFades";

const noop = () => {};

export class OutputLevel {
  private trackGain = 1;
  private cancelFade: () => void = noop;

  constructor(private readonly audio: () => HTMLAudioElement) {}

  public setTrackGain(gain: number): void {
    this.trackGain = gain;
  }

  /** The user's volume, scaled by the track's loudness when normalization is on. */
  public target(): number {
    const { volume, normalizeVolume } = usePlayerStore.getState();
    return volume * (normalizeVolume ? this.trackGain : 1);
  }

  /** A hidden page skips fades, so a track starts at its volume there. */
  public startVolume(): number {
    return isPageHidden() ? Math.min(1, this.target()) : FADE_FLOOR;
  }

  public fadeTo(target: number, onDone?: () => void): void {
    this.stopFade();
    this.cancelFade = fadeVolume(this.audio(), target, onDone);
  }

  /** @param crossfadeMs - fades in along playback over this long; a plain fade when zero */
  public fadeIn(crossfadeMs: number): void {
    if (crossfadeMs <= 0) {
      this.fadeTo(this.target());
      return;
    }
    this.stopFade();
    this.cancelFade = fadeInAlongPlayback(this.audio(), crossfadeMs, () => this.target());
  }

  public stopFade(): void {
    this.cancelFade();
    this.cancelFade = noop;
  }

  /** Applies a volume change at once, dropping a fade in flight. */
  public follow(): void {
    this.stopFade();
    const audio = this.audio();
    if (!audio.paused) audio.volume = this.target();
  }
}
