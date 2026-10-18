import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import type { SyncedLine } from "../engine/lyricsParser";
import { activeLineIndices, buildTimeline, sameIndices } from "../lib/activeLines";
import { anchorAt, currentPosition, resyncAnchor, type ClockAnchor } from "../lib/lyricsClock";
import { paintWords, type WordTiming } from "../lib/wordHighlight";

export interface LyricsAnimatorOptions {
  syncedLines: SyncedLine[];
  isActuallySynced: boolean;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  onActiveLineChange: (indices: number[]) => void;
}

function useClockAnchor(isPlaying: boolean, positionMs: number): MutableRefObject<ClockAnchor> {
  const anchor = useRef(anchorAt(positionMs, performance.now()));
  const latest = useRef({ isPlaying, positionMs });
  latest.current = { isPlaying, positionMs };

  useEffect(() => {
    anchor.current = anchorAt(latest.current.positionMs, performance.now());
  }, [isPlaying]);

  useEffect(() => {
    anchor.current = resyncAnchor(anchor.current, latest.current, performance.now());
  }, [positionMs]);

  return anchor;
}

function useWordRegistry() {
  const spans = useRef(new Map<number, HTMLElement[]>());
  const words = useRef(new Map<number, WordTiming[]>());

  const setWordData = useCallback((lineIndex: number, timings: WordTiming[]) => {
    words.current.set(lineIndex, timings);
  }, []);

  const clearWordSpans = useCallback((lineIndex: number) => {
    spans.current.delete(lineIndex);
    words.current.delete(lineIndex);
  }, []);

  const registerWordSpan = useCallback((lineIndex: number, wordIndex: number, totalWords: number, el: HTMLElement | null) => {
    if (!el) return;
    const current = spans.current.get(lineIndex);
    const lineSpans = current?.length === totalWords ? current : new Array<HTMLElement>(totalWords);
    lineSpans[wordIndex] = el;
    spans.current.set(lineIndex, lineSpans);
  }, []);

  return { spans, words, setWordData, clearWordSpans, registerWordSpan };
}

function useFrameLoop(onFrame: MutableRefObject<() => void>): void {
  useEffect(() => {
    let frame = requestAnimationFrame(function tick() {
      onFrame.current();
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [onFrame]);
}

/**
 * Follows playback on every frame: reports the active lines and fills word highlights straight in the DOM,
 * since a React render per frame would be far too slow for word-level lyrics.
 */
export function useLyricsAnimator(options: LyricsAnimatorOptions) {
  const anchor = useClockAnchor(options.isPlaying, options.positionMs);
  const registry = useWordRegistry();
  const timeline = useMemo(() => buildTimeline(options.syncedLines), [options.syncedLines]);
  const active = useRef<number[]>([]);
  const frame = useRef(() => {});

  frame.current = () => {
    const position = currentPosition(anchor.current, performance.now(), options);
    const indices = options.isActuallySynced ? activeLineIndices(timeline, position) : [];
    if (!sameIndices(indices, active.current)) {
      active.current = indices;
      options.onActiveLineChange(indices);
    }
    indices.forEach((i) => paintWords(registry.spans.current.get(i), registry.words.current.get(i), position));
  };
  useFrameLoop(frame);

  const { setWordData, clearWordSpans, registerWordSpan } = registry;
  return { setWordData, clearWordSpans, registerWordSpan };
}
