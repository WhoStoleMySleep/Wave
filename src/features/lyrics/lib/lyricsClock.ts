export interface ClockAnchor {
  positionMs: number;
  at: number;
}

interface PlaybackReport {
  positionMs: number;
  isPlaying: boolean;
}

const DRIFT_TOLERANCE_MS = 150;

export function anchorAt(positionMs: number, at: number): ClockAnchor {
  return { positionMs, at };
}

function estimatePosition(anchor: ClockAnchor, now: number, durationMs = Infinity): number {
  return Math.min(durationMs || Infinity, Math.max(0, anchor.positionMs + now - anchor.at));
}

/** Position reports are coarse, so a running clock follows one only when it drifted past the tolerance. */
export function resyncAnchor(anchor: ClockAnchor, report: PlaybackReport, now: number): ClockAnchor {
  const drift = Math.abs(estimatePosition(anchor, now) - report.positionMs);
  return !report.isPlaying || drift > DRIFT_TOLERANCE_MS ? anchorAt(report.positionMs, now) : anchor;
}

/** Runs the clock on from the anchor while playing; a paused or loading track stays where it is. */
export function currentPosition(anchor: ClockAnchor, now: number, playback: { isPlaying: boolean; durationMs: number }): number {
  return playback.isPlaying ? estimatePosition(anchor, now, playback.durationMs) : anchor.positionMs;
}
