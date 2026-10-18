import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Lyric } from "@braccato/parsers";
import type { LyricsCandidate } from "@/shared/contracts/lyrics";
import { debouncedStorage } from "@/shared/utils/storage";
import { applyLyricsOffset, parseRawLyrics, type SyncedLine, type TimedLyrics } from "../engine/lyricsParser";
import type { LyricsProviderOption } from "../lib/candidateRanking";

export interface LyricsData {
  lyricsLoading: boolean;
  lyricsError: string | null;
  rawLyrics: string | null;
  rawFormat: string | null;
  baseBraccatoLyrics: Lyric[];
  baseSyncedLines: SyncedLine[];
  braccatoLyrics: Lyric[];
  syncedLines: SyncedLine[];
  plainLyrics: string | null;
  lyricsQuality: number;
  currentLyricsTrackId: string | null;
  activeProvider: string | null;
  availableProviders: LyricsProviderOption[];
  offsetMs: number;
  trackOffsets: Record<string, number>;
}

export type LyricsPatch = Partial<LyricsData>;

interface LyricsActions {
  setLyricsState: (patch: LyricsPatch) => void;
  selectProvider: (provider: string) => void;
  setOffset: (offsetMs: number) => void;
  adjustOffset: (deltaMs: number) => void;
  resetOffset: () => void;
  reset: () => void;
}

export type LyricsState = LyricsData & LyricsActions;

const LYRICS_SESSION_STORAGE_KEY = "wave_lyrics_session_v1";

const EMPTY_LYRICS: Omit<LyricsData, "trackOffsets"> = {
  lyricsLoading: false,
  lyricsError: null,
  rawLyrics: null,
  rawFormat: null,
  baseBraccatoLyrics: [],
  baseSyncedLines: [],
  braccatoLyrics: [],
  syncedLines: [],
  plainLyrics: null,
  lyricsQuality: 0,
  currentLyricsTrackId: null,
  activeProvider: null,
  availableProviders: [],
  offsetMs: 0,
};

/** The fields that show `candidate`; the store moves its timings by the current offset. */
export function lyricsPatchFor(candidate: LyricsCandidate): LyricsPatch {
  const { content, format } = candidate.lyrics;
  const parsed = parseRawLyrics(content);
  return {
    rawLyrics: content,
    rawFormat: format,
    braccatoLyrics: parsed.braccatoLyrics,
    syncedLines: parsed.syncedLines,
    plainLyrics: parsed.plainLyrics,
    lyricsQuality: candidate.quality.total,
    activeProvider: candidate.provider,
  };
}

function isNewTrack(state: LyricsData, patch: LyricsPatch): boolean {
  return patch.currentLyricsTrackId !== undefined && patch.currentLyricsTrackId !== state.currentLyricsTrackId;
}

function offsetFor(state: LyricsData, patch: LyricsPatch, newTrack: boolean): number {
  if (patch.offsetMs !== undefined) return patch.offsetMs;
  if (!newTrack) return state.offsetMs;
  return (patch.currentLyricsTrackId && state.trackOffsets[patch.currentLyricsTrackId]) || 0;
}

function baseFor(state: LyricsData, patch: LyricsPatch, newTrack: boolean): TimedLyrics {
  return {
    braccatoLyrics: patch.baseBraccatoLyrics ?? patch.braccatoLyrics ?? (newTrack ? [] : state.baseBraccatoLyrics),
    syncedLines: patch.baseSyncedLines ?? patch.syncedLines ?? (newTrack ? [] : state.baseSyncedLines),
  };
}

/**
 * Lyrics in a patch are taken as unshifted; a new track restores the offset saved for it.
 * @returns the next state with the shown timings moved by the resulting offset
 */
export function mergeLyricsPatch(state: LyricsData, patch: LyricsPatch): LyricsData {
  const newTrack = isNewTrack(state, patch);
  const base = baseFor(state, patch, newTrack);
  const offsetMs = offsetFor(state, patch, newTrack);
  return {
    ...state,
    ...patch,
    offsetMs,
    baseBraccatoLyrics: base.braccatoLyrics,
    baseSyncedLines: base.syncedLines,
    ...applyLyricsOffset(base, offsetMs),
  };
}

function withTrackOffset(offsets: Record<string, number>, trackId: string | null, offsetMs: number): Record<string, number> {
  if (!trackId) return offsets;
  const next = { ...offsets };
  if (offsetMs === 0) delete next[trackId];
  else next[trackId] = offsetMs;
  return next;
}

function shiftedBy(state: LyricsData, offsetMs: number): LyricsPatch {
  const base = { braccatoLyrics: state.baseBraccatoLyrics, syncedLines: state.baseSyncedLines };
  const trackOffsets = withTrackOffset(state.trackOffsets, state.currentLyricsTrackId, offsetMs);
  return { offsetMs, trackOffsets, ...applyLyricsOffset(base, offsetMs) };
}

export const useLyricsStore = create<LyricsState>()(
  persist(
    (set, get) => ({
      ...EMPTY_LYRICS,
      trackOffsets: {},

      setLyricsState: (patch) => set((state) => mergeLyricsPatch(state, patch)),
      selectProvider: (provider) => {
        const option = get().availableProviders.find((item) => item.provider === provider);
        if (option) get().setLyricsState(lyricsPatchFor(option.candidate));
      },
      setOffset: (offsetMs) => set((state) => shiftedBy(state, offsetMs)),
      adjustOffset: (deltaMs) => get().setOffset(get().offsetMs + deltaMs),
      resetOffset: () => get().setOffset(0),
      reset: () => set(EMPTY_LYRICS),
    }),
    {
      name: LYRICS_SESSION_STORAGE_KEY,
      storage: createJSONStorage(() => debouncedStorage),
      partialize: (state) => ({ currentLyricsTrackId: state.currentLyricsTrackId, trackOffsets: state.trackOffsets }),
    },
  ),
);
