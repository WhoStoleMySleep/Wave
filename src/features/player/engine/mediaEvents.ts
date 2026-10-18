const DEFAULT_MEDIA_ERROR = "Audio playback error";
const END_TOLERANCE_S = 1.5;
const MS_PER_SECOND = 1000;

const MEDIA_EVENTS = ["timeupdate", "durationchange", "waiting", "ended", "playing", "pause", "error"] as const;

export type MediaEvent = (typeof MEDIA_EVENTS)[number];
export type MediaHandlers = Record<MediaEvent, (audio: HTMLAudioElement) => void>;

export interface MediaErrorInfo {
  code: number | undefined;
  message: string;
}

function guarded(audio: HTMLAudioElement, handler: (audio: HTMLAudioElement) => void, isActive: (audio: HTMLAudioElement) => boolean) {
  return () => {
    if (isActive(audio)) handler(audio);
  };
}

/** Routes the element's events to `handlers` while `isActive` holds, so a retired or resetting element stays quiet. */
export function listenMediaEvents(audio: HTMLAudioElement, handlers: MediaHandlers, isActive: (audio: HTMLAudioElement) => boolean): void {
  MEDIA_EVENTS.forEach((event) => audio.addEventListener(event, guarded(audio, handlers[event], isActive)));
}

/** @returns where the element is, or null before it has a time to report */
export function positionMs(audio: HTMLAudioElement): number | null {
  return Number.isNaN(audio.currentTime) ? null : Math.round(audio.currentTime * MS_PER_SECOND);
}

/** @returns the length once the element knows it, otherwise null */
export function knownDurationMs(audio: HTMLAudioElement): number | null {
  return audio.duration > 0 ? Math.round(audio.duration * MS_PER_SECOND) : null;
}

/** An empty load or a teardown fires `ended` too, short of the real end. */
export function isRealEnd(audio: HTMLAudioElement): boolean {
  return audio.duration > 0 && audio.currentTime >= audio.duration - END_TOLERANCE_S;
}

export function mediaErrorInfo(audio: HTMLAudioElement): MediaErrorInfo {
  return { code: audio.error?.code, message: audio.error?.message || DEFAULT_MEDIA_ERROR };
}
