import { describe, expect, it } from "vitest";
import type { SyncedLine } from "./engine/lyricsParser";
import { activeLineIndices, buildTimeline, sameIndices } from "./lib/activeLines";
import { anchorAt, currentPosition, resyncAnchor } from "./lib/lyricsClock";
import { wordProgress } from "./lib/wordHighlight";

function line(timeMs: number, text = `line at ${timeMs}`): SyncedLine {
  return { timeMs, text };
}

describe("lyrics clock", () => {
  it("does not run on while the track is paused or loading", () => {
    expect(currentPosition(anchorAt(0, 1000), 3500, { isPlaying: false, durationMs: 10_000 })).toBe(0);
  });

  it("runs on from the anchor while playing, within the track", () => {
    const playing = { isPlaying: true, durationMs: 10_000 };
    expect(currentPosition(anchorAt(0, 3500), 3600, playing)).toBe(100);
    expect(currentPosition(anchorAt(9_900, 0), 500, playing)).toBe(10_000);
  });

  it("follows a position report only once the clock drifted past the tolerance", () => {
    const anchor = anchorAt(1000, 0);
    expect(resyncAnchor(anchor, { positionMs: 1100, isPlaying: true }, 100)).toBe(anchor);
    expect(resyncAnchor(anchor, { positionMs: 5000, isPlaying: true }, 100)).toEqual(anchorAt(5000, 100));
  });

  it("takes every report while paused", () => {
    expect(resyncAnchor(anchorAt(1000, 0), { positionMs: 1010, isPlaying: false }, 50)).toEqual(anchorAt(1010, 50));
  });
});

describe("activeLineIndices", () => {
  const lines = [line(2000), line(6000), line(6500, "<bg> echo"), line(9000, "<bg> late"), line(12_000)];
  const timeline = buildTimeline(lines);

  it("has no active line before the first one starts", () => {
    expect(activeLineIndices(timeline, 1999)).toEqual([]);
  });

  it("activates a line exactly at its start", () => {
    expect(activeLineIndices(timeline, 2000)).toEqual([0]);
  });

  it("keeps the main line active together with the started background lines after it", () => {
    expect(activeLineIndices(timeline, 7000)).toEqual([1, 2]);
    expect(activeLineIndices(timeline, 9500)).toEqual([1, 2, 3]);
  });

  it("never makes a background line the main one", () => {
    expect(activeLineIndices(buildTimeline([line(1000, "<bg> only")]), 5000)).toEqual([]);
  });

  it("stops at the first line still ahead even when a later one starts earlier", () => {
    const unordered = buildTimeline([line(1000), line(5000), line(2000)]);
    expect(activeLineIndices(unordered, 3000)).toEqual([0]);
  });

  it("has nothing active for empty lyrics", () => {
    expect(activeLineIndices(buildTimeline([]), 1000)).toEqual([]);
  });
});

describe("sameIndices", () => {
  it("compares the lists element by element", () => {
    expect(sameIndices([1, 2], [1, 2])).toBe(true);
    expect(sameIndices([1, 2], [1])).toBe(false);
    expect(sameIndices([1, 2], [1, 3])).toBe(false);
  });
});

describe("wordProgress", () => {
  const word = { timeMs: 2000, endMs: 3000 };

  it("fills a word along its duration without passing 100%", () => {
    expect(wordProgress(word, 1500)).toBe(0);
    expect(wordProgress(word, 2500)).toBe(50);
    expect(wordProgress(word, 3000)).toBe(100);
    expect(wordProgress(word, 5000)).toBe(100);
  });

  it("lights a word without duration up at once when it is reached", () => {
    const short = { timeMs: 2500, endMs: 2500 };
    expect(wordProgress(short, 2499)).toBe(0);
    expect(wordProgress(short, 2500)).toBe(100);
  });
});
