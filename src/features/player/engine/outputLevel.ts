import { usePlayerStore } from "../store/playerStore";
import { FADE_FLOOR, fadeInAlongPlayback, fadeVolume, isPageHidden } from "./audioFades";

const noop = () => {};

export class OutputLevel {
  private trackGain = 1;
  private duck = 1;
  private cancelFade: () => void = noop;
  private fading = false;

  constructor(private readonly audio: () => HTMLAudioElement) {}

  public setTrackGain(gain: number): void {
    this.trackGain = gain;
  }

  /** The user's volume, scaled by the track's loudness when normalization is on and by ducking. */
  public target(): number {
    const { volume, normalizeVolume } = usePlayerStore.getState();
    return volume * (normalizeVolume ? this.trackGain : 1) * this.duck;
  }

  /**
   * Lowers the output to `factor` of its target while another app sounds. A fade in
   * flight is left alone: it reads the target as it goes or lands near it.
   */
  public setDuck(factor: number): void {
    this.duck = factor;
    const audio = this.audio();
    if (!this.fading && !audio.paused) audio.volume = Math.min(1, this.target());
  }

  /** A hidden page skips fades, so a track starts at its volume there. */
  public startVolume(): number {
    return isPageHidden() ? Math.min(1, this.target()) : FADE_FLOOR;
  }

  public fadeTo(target: number, onDone?: () => void): void {
    this.stopFade();
    this.fading = true;
    this.cancelFade = fadeVolume(this.audio(), target, () => {
      this.fading = false;
      onDone?.();
    });
  }

  /** @param crossfadeMs - fades in along playback over this long; a plain fade when zero */
  public fadeIn(crossfadeMs: number): void {
    if (crossfadeMs <= 0) {
      this.fadeTo(this.target());
      return;
    }
    this.stopFade();
    this.fading = true;
    this.cancelFade = fadeInAlongPlayback(this.audio(), crossfadeMs, () => this.target(), () => {
      this.fading = false;
    });
  }

  public stopFade(): void {
    this.cancelFade();
    this.cancelFade = noop;
    this.fading = false;
  }

  /** Applies a volume change at once, dropping a fade in flight. */
  public follow(): void {
    this.stopFade();
    const audio = this.audio();
    if (!audio.paused) audio.volume = this.target();
  }
}
