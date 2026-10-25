import { usePlayerStore, type PlayerState } from "../store/playerStore";
import { log } from "@/shared/utils/logger";
import type { OtherAudioWatch } from "@/platform/otherAudio";
import type { OutputLevel } from "./outputLevel";

/** Long enough to read as the music stepping back rather than cutting out. */
export const DUCK_MS = 1500;
/** Coming back is slower still, so the return is barely noticed. */
export const RESTORE_MS = 3000;
const STEP_MS = 33;

function easeInOut(progress: number): number {
  return 0.5 - 0.5 * Math.cos(progress * Math.PI);
}

/**
 * Glides the ducking factor between two levels. Timers drive it in a visible page;
 * a hidden one throttles them to seconds, so the element's `timeupdate`, which keeps
 * firing a few times a second while it plays, drives it there too.
 */
export class DuckGlide {
  private factor = 1;
  private from = 1;
  private to = 1;
  private startedAt = 0;
  private durationMs = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private element: HTMLAudioElement | null = null;

  constructor(
    private readonly audio: () => HTMLAudioElement,
    private readonly apply: (factor: number) => void,
  ) {}

  public get current(): number {
    return this.factor;
  }

  public glideTo(target: number, durationMs: number): void {
    this.stop();
    if (Math.abs(target - this.factor) < 0.001) return;
    this.from = this.factor;
    this.to = target;
    this.startedAt = performance.now();
    this.durationMs = durationMs;
    this.element = this.audio();
    this.element.addEventListener("timeupdate", this.step);
    this.timer = setTimeout(this.step, STEP_MS);
  }

  public stop(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.element?.removeEventListener("timeupdate", this.step);
    this.element = null;
  }

  private readonly step = (): void => {
    const progress = Math.min(1, (performance.now() - this.startedAt) / this.durationMs);
    this.factor = this.from + (this.to - this.from) * easeInOut(progress);
    this.apply(this.factor);
    if (progress >= 1) {
      this.stop();
      return;
    }
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(this.step, STEP_MS);
  };
}

/**
 * Lowers the music while another app plays sound and brings it back after,
 * when the setting is on and the shell can tell.
 * @param watch - the shell's report of other sound; null where there is none
 * @returns stops ducking and watching
 */
export function installAudioDucking(
  level: OutputLevel,
  audio: () => HTMLAudioElement,
  watch: OtherAudioWatch | null,
): () => void {
  if (!watch) return () => {};
  const glide = new DuckGlide(audio, (factor) => level.setDuck(factor));
  let heard = false;
  let unwatch: (() => void) | null = null;

  const follow = () => {
    const target = heard ? usePlayerStore.getState().duckVolume : 1;
    glide.glideTo(target, target < glide.current ? DUCK_MS : RESTORE_MS);
  };

  const onChange = (active: boolean) => {
    heard = active;
    log("cyan", "ducking", active ? "another app is sounding" : "the other sound stopped");
    follow();
  };

  const sync = (state: PlayerState, prev?: PlayerState) => {
    if (state.duckOthers && !unwatch) {
      unwatch = watch(onChange);
    } else if (!state.duckOthers && unwatch) {
      unwatch();
      unwatch = null;
      heard = false;
      follow();
    } else if (heard && prev && state.duckVolume !== prev.duckVolume) {
      follow();
    }
  };

  const unsubscribe = usePlayerStore.subscribe(sync);
  sync(usePlayerStore.getState());
  return () => {
    unsubscribe();
    unwatch?.();
    glide.stop();
  };
}
