import { useRef } from "react";

const TICK_MS = 250;
const MAX_GLIDE_MS = 1000;

/**
 * Playback reports its position about four times a second. Gliding linearly over one tick turns
 * those steps into continuous motion; seeks, track changes and scrubbing jump at once.
 * The glide is kept per position, so a re-render for another reason does not cut a glide short.
 * @returns the CSS transition for a fill that follows `positionMs`
 */
export function usePlaybackGlide(positionMs: number, frozen = false): string {
  const last = useRef({ positionMs, glide: "none" });
  if (last.current.positionMs !== positionMs) {
    const step = positionMs - last.current.positionMs;
    last.current = { positionMs, glide: step > 0 && step <= MAX_GLIDE_MS ? `transform ${TICK_MS}ms linear` : "none" };
  }
  return frozen ? "none" : last.current.glide;
}
