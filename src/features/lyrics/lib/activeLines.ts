import type { SyncedLine } from "../engine/lyricsParser";

export interface LineTimeline {
  times: number[];
  latestStart: number[];
  lastMainUpTo: number[];
  isBackground: boolean[];
}

const BACKGROUND_LINE = /^\s*<[^>]+>/;

/** Precomputes what every frame needs, so a frame costs a binary search instead of a scan with a regex per line. */
export function buildTimeline(lines: readonly SyncedLine[]): LineTimeline {
  const timeline: LineTimeline = { times: [], latestStart: [], lastMainUpTo: [], isBackground: [] };
  lines.forEach((line, i) => {
    const background = BACKGROUND_LINE.test(line.text);
    timeline.times.push(line.timeMs);
    timeline.isBackground.push(background);
    timeline.latestStart.push(Math.max(line.timeMs, timeline.latestStart[i - 1] ?? -Infinity));
    timeline.lastMainUpTo.push(background ? (timeline.lastMainUpTo[i - 1] ?? -1) : i);
  });
  return timeline;
}

function startedCount({ latestStart }: LineTimeline, positionMs: number): number {
  let low = 0;
  let high = latestStart.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (latestStart[middle] <= positionMs) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * Lines up to the first one still ahead count as started; the latest started main line is active,
 * together with the started background lines right after it.
 */
export function activeLineIndices(timeline: LineTimeline, positionMs: number): number[] {
  const started = startedCount(timeline, positionMs);
  const main = started > 0 ? timeline.lastMainUpTo[started - 1] : -1;
  if (main < 0) return [];
  const active = [main];
  for (let i = main + 1; i < timeline.times.length && timeline.isBackground[i]; i++) {
    if (timeline.times[i] <= positionMs) active.push(i);
  }
  return active;
}

export function sameIndices(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((index, i) => index === b[i]);
}
