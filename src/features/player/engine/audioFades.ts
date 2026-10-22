import { releaseSource } from "./audioElement";

export const FADE_FLOOR = 0.001;

const FADE_MS = 180;
const FADE_TICK_MS = 16;
const MIN_RETIRE_FADE_S = 0.1;
const MS_PER_SECOND = 1000;

const noop = () => {};

function clampVolume(volume: number): number {
  return Math.max(0, Math.min(1, volume));
}

function easeInOut(progress: number): number {
  return 0.5 - 0.5 * Math.cos(progress * Math.PI);
}

export function isPageHidden(): boolean {
  return typeof document !== "undefined" && document.hidden;
}

/**
 * Eases the volume to `target` on a timer. A hidden page throttles timers to seconds,
 * so there the volume is set at once.
 * @returns cancels the fade; `onDone` is not called then
 */
export function fadeVolume(audio: HTMLAudioElement, target: number, onDone: () => void = noop, durationMs = FADE_MS): () => void {
  const from = audio.volume;
  if (Math.abs(target - from) <= FADE_FLOOR || isPageHidden()) {
    audio.volume = clampVolume(target);
    onDone();
    return noop;
  }
  const startedAt = performance.now();
  const tick = () => {
    const progress = Math.min(1, (performance.now() - startedAt) / durationMs);
    audio.volume = clampVolume(from + (target - from) * easeInOut(progress));
    if (progress < 1) timer = setTimeout(tick, FADE_TICK_MS);
    else onDone();
  };
  let timer = setTimeout(tick, FADE_TICK_MS);
  return () => clearTimeout(timer);
}

/**
 * Fades in along the element's own `timeupdate`, which keeps firing in a hidden page,
 * so a crossfade holds its length there.
 * @param volume - reads the target on every step, so a volume change mid-fade is followed
 * @returns cancels the fade
 */
export function fadeInAlongPlayback(audio: HTMLAudioElement, durationMs: number, volume: () => number): () => void {
  const from = audio.currentTime;
  const stop = () => audio.removeEventListener("timeupdate", onTime);
  const onTime = () => {
    const progress = Math.min(1, ((audio.currentTime - from) * MS_PER_SECOND) / durationMs);
    audio.volume = Math.max(FADE_FLOOR, Math.min(1, volume() * progress));
    if (progress >= 1) stop();
  };
  audio.addEventListener("timeupdate", onTime);
  return stop;
}

/**
 * Lets a crossfaded track fade out to its end on its own `timeupdate`, then removes
 * the element and frees its blob.
 * @returns stops the track at once; safe to call more than once
 */
export function retireAudio(audio: HTMLAudioElement, blobUrl: string | null): () => void {
  const from = audio.currentTime;
  const startVolume = audio.volume;
  const length = Math.max(MIN_RETIRE_FADE_S, (audio.duration || from) - from);
  const onTime = () => {
    const progress = Math.min(1, (audio.currentTime - from) / length);
    audio.volume = Math.max(FADE_FLOOR, startVolume * (1 - progress));
  };
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    for (const [event, handler] of listeners) audio.removeEventListener(event, handler);
    releaseSource(audio);
    audio.remove();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  };
  const listeners: [string, () => void][] = [["timeupdate", onTime], ["ended", stop], ["error", stop]];
  for (const [event, handler] of listeners) audio.addEventListener(event, handler);
  audio.removeAttribute("id");
  return stop;
}
