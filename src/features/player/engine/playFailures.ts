import type { Track } from "@/shared/types";
import { log } from "@/shared/utils/logger";
import { errorMessage, hasErrorName, isAbortError } from "./engineUtils";

export type PlayErrorKind = "superseded" | "blocked" | "failed";

/** An abort means a newer request took over; NotAllowedError means autoplay waits for a user gesture. */
export function classifyPlayError(error: unknown): PlayErrorKind {
  if (isAbortError(error)) return "superseded";
  return hasErrorName(error, "NotAllowedError") ? "blocked" : "failed";
}

export function logPlaybackFailure(track: Track, error: unknown): void {
  log("red", "playback", `"${track.title}" failed: ${errorMessage(error)}`);
}
