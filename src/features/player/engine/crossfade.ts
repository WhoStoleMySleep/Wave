import type { PlayerState } from "../store/playerStore";

const MS_PER_SECOND = 1000;

type CrossfadeState = Pick<PlayerState, "crossfadeSeconds" | "status" | "repeat" | "currentIndex" | "queue">;

export function crossfadeMs(state: Pick<PlayerState, "crossfadeSeconds">): number {
  return state.crossfadeSeconds * MS_PER_SECOND;
}

function hasNextTrack({ currentIndex, queue, repeat }: CrossfadeState): boolean {
  return currentIndex + 1 < queue.length || repeat === "all";
}

function canCrossfade(state: CrossfadeState, durationMs: number): boolean {
  const fadeMs = crossfadeMs(state);
  if (fadeMs <= 0 || state.status !== "playing" || state.repeat === "one") return false;
  return hasNextTrack(state) && Number.isFinite(durationMs) && durationMs >= fadeMs * 2;
}

export function isCrossfadeDue(audio: HTMLAudioElement, state: CrossfadeState): boolean {
  const durationMs = audio.duration * MS_PER_SECOND;
  if (!canCrossfade(state, durationMs)) return false;
  return durationMs - audio.currentTime * MS_PER_SECOND <= crossfadeMs(state);
}
