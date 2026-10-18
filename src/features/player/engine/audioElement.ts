import { log } from "@/shared/utils/logger";
import { errorMessage } from "./engineUtils";

const AUDIO_ELEMENT_ID = "wave-audio";
const MS_PER_SECOND = 1000;

export const HAVE_METADATA = 1;
export const HAVE_FUTURE_DATA = 3;
export const HAVE_ENOUGH_DATA = 4;

type ReadyState = typeof HAVE_FUTURE_DATA | typeof HAVE_ENOUGH_DATA;

const READY_EVENTS: Record<ReadyState, keyof HTMLMediaElementEventMap> = {
  [HAVE_FUTURE_DATA]: "canplay",
  [HAVE_ENOUGH_DATA]: "canplaythrough",
};

interface WaveWindow {
  __wave_audio?: HTMLAudioElement;
}

function waveWindow(): (Window & WaveWindow) | null {
  return typeof window === "undefined" ? null : window;
}

export function createAudioElement(): HTMLAudioElement {
  const audio = new Audio();
  audio.id = AUDIO_ELEMENT_ID;
  audio.crossOrigin = "anonymous";
  audio.preload = "auto";
  document.body.appendChild(audio);
  return audio;
}

/** The touch bar and the fullscreen player reach the playing element through the window. */
export function publishAudioElement(audio: HTMLAudioElement): void {
  const win = waveWindow();
  if (win) win.__wave_audio = audio;
}

/** Reuses the element a hot reload left behind, so playback and the effects graph survive it. */
export function adoptAudioElement(): HTMLAudioElement {
  const existing = waveWindow()?.__wave_audio ?? document.getElementById(AUDIO_ELEMENT_ID);
  const audio = existing instanceof HTMLAudioElement ? existing : createAudioElement();
  publishAudioElement(audio);
  return audio;
}

/** An element without a source reports the page address as its `src`. */
export function hasSource(audio: HTMLAudioElement): boolean {
  return Boolean(audio.src) && audio.src !== window.location.href;
}

export function releaseSource(audio: HTMLAudioElement): void {
  try {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  } catch (error) {
    log("yellow", "audio", `source release failed: ${errorMessage(error)}`);
  }
}

/** Seeks now or once metadata arrives: an element without metadata rejects `currentTime`. */
export function seekWhenLoaded(audio: HTMLAudioElement, positionMs: number, isCurrent: () => boolean = () => true): void {
  const apply = () => {
    if (!isCurrent()) return;
    try {
      audio.currentTime = positionMs / MS_PER_SECOND;
    } catch (error) {
      log("yellow", "audio", `seek failed: ${errorMessage(error)}`);
    }
  };
  if (audio.readyState >= HAVE_METADATA) apply();
  else audio.addEventListener("loadedmetadata", apply, { once: true });
}

/**
 * Resolves once the element reaches `state`, fails to load, or the timeout passes.
 * Listeners are removed on every path: a buffered source never fires the event again,
 * so a leftover listener would stay on the shared element for the whole session.
 */
export function waitForReadyState(audio: HTMLAudioElement, state: ReadyState, timeoutMs: number): Promise<void> {
  if (audio.readyState >= state) return Promise.resolve();
  const event = READY_EVENTS[state];
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      audio.removeEventListener(event, done);
      audio.removeEventListener("error", done);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    audio.addEventListener(event, done);
    audio.addEventListener("error", done);
  });
}
