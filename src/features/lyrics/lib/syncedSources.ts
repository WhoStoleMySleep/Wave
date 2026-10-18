import type { Lyric } from "@braccato/parsers";
import type { LyricsProviderOption } from "./candidateRanking";

function isTimed(value: string | null | undefined): boolean {
  return Boolean(value) && value !== "plain";
}

function isSyncedOption({ syncLevel, candidate }: LyricsProviderOption): boolean {
  return isTimed(syncLevel) || isTimed(candidate?.syncLevel) || isTimed(candidate?.lyrics?.format) || isTimed(candidate?.contentKind);
}

function hasTiming(line: Lyric): boolean {
  return (line.startTimeMs ?? 0) > 0 || (line.durationMs ?? 0) > 0;
}

/** Whether any provider or the shown lyrics carry timings, which is what makes the sync controls useful. */
export function hasSyncedLyricsSources(
  availableProviders: readonly LyricsProviderOption[] = [],
  braccatoLyrics: readonly Lyric[] = [],
  rawFormat: string | null = null,
): boolean {
  return availableProviders.some(isSyncedOption) || braccatoLyrics.some(hasTiming) || isTimed(rawFormat);
}
