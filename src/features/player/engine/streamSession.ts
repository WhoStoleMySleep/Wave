import type { PlaybackSession } from "@/shared/api";

const EXPIRY_MARGIN_MS = 15_000;
const DECIBELS_PER_TENFOLD = 20;

/**
 * Volume factor for a track `loudnessDb` above the target. Element volume tops out
 * at 1, so only louder tracks come down, as on YouTube.
 */
export function loudnessGain(loudnessDb: number | null | undefined): number {
  if (typeof loudnessDb !== "number" || !Number.isFinite(loudnessDb)) return 1;
  return Math.min(1, Math.pow(10, -loudnessDb / DECIBELS_PER_TENFOLD));
}

/** @returns when the stream URL stops working, or null when the server gave no valid date */
export function sessionExpiry(session: Pick<PlaybackSession, "expiresAt">): number | null {
  if (!session.expiresAt) return null;
  const expiresAt = new Date(session.expiresAt).getTime();
  return Number.isFinite(expiresAt) ? expiresAt : null;
}

/** Counts a stream as expired a little early, so a resume never hits a dead URL mid-request. */
export function isSessionExpired(expiresAt: number | null, now = Date.now()): boolean {
  return expiresAt !== null && now >= expiresAt - EXPIRY_MARGIN_MS;
}
