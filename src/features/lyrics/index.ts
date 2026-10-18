export {
  parseRawLyrics,
  applyLyricsOffset,
  type ParsedLyrics,
  type SyncedLine,
  type TimedLyrics,
  type WordData,
} from "./engine/lyricsParser";
export { braccatoThemeCss } from "./engine/braccatoTheme";
export {
  useLyricsStore,
  lyricsPatchFor,
  type LyricsData,
  type LyricsPatch,
  type LyricsState,
} from "./store/lyricsStore";
export { hasSyncedLyricsSources } from "./lib/syncedSources";
export {
  shouldCacheLyricsCandidate,
  compareLyricsCandidates,
  isBetterLyricsCandidate,
  isWordLevelSync,
  rankProviders,
  toProviderOption,
  type LyricsProviderOption,
  type RankedProviders,
} from "./lib/candidateRanking";
export { lyricsCache, type CachedLyricsItem } from "./store/lyricsCache";
export { useLyricsAnimator, type LyricsAnimatorOptions } from "./hooks/useLyricsAnimator";
export { LyricsProviderIsland } from "./ui/LyricsProviderIsland";
