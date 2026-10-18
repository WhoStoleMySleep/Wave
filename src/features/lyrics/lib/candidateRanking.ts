import type { LyricsCandidate, LyricsSyncLevel } from "@/shared/contracts/lyrics";

export interface LyricsProviderOption {
  provider: string;
  syncLevel: LyricsSyncLevel;
  quality: number;
  candidate: LyricsCandidate;
}

export interface RankedProviders {
  providers: Record<string, LyricsCandidate>;
  options: LyricsProviderOption[];
}

const SYNC_RANK: Record<LyricsSyncLevel, number> = {
  plain: 0,
  line_level: 1,
  syllable_level: 2,
  word_level: 3,
};

const WORD_LEVEL_ONLY_PROVIDERS = new Set(["cadence", "polaris", "polaris mono"]);
const PREFERRED_WORD_PROVIDERS = new Set(["polaris mono", "binimum"]);

function providerName(provider: string | undefined): string {
  return (provider ?? "").toLowerCase().trim().replace(/[-_]/g, " ");
}

export function providerKey(provider: string): string {
  return provider.toLowerCase().trim();
}

export function isWordLevelSync(syncLevel: LyricsSyncLevel): boolean {
  return syncLevel === "word_level" || syncLevel === "syllable_level";
}

/** Timing providers are worth keeping only for the word-level sync they exist for. */
export function shouldCacheLyricsCandidate(candidate?: LyricsCandidate | null): candidate is LyricsCandidate {
  if (!candidate?.lyrics?.content) return false;
  if (!WORD_LEVEL_ONLY_PROVIDERS.has(providerName(candidate.provider))) return true;
  return isWordLevelSync(candidate.syncLevel);
}

function preference(candidate: LyricsCandidate): number {
  return PREFERRED_WORD_PROVIDERS.has(providerName(candidate.provider)) ? 1 : 0;
}

/** Sorts best first: deeper sync, then quality, then the preferred word-level providers. */
export function compareLyricsCandidates(a: LyricsCandidate, b: LyricsCandidate): number {
  const bySync = (SYNC_RANK[b.syncLevel] ?? 0) - (SYNC_RANK[a.syncLevel] ?? 0);
  if (bySync !== 0) return bySync;
  const byQuality = b.quality.total - a.quality.total;
  if (byQuality !== 0 || !isWordLevelSync(a.syncLevel)) return byQuality;
  return preference(b) - preference(a);
}

export function isBetterLyricsCandidate(next: LyricsCandidate, current: LyricsCandidate): boolean {
  return compareLyricsCandidates(next, current) < 0;
}

export function toProviderOption(candidate: LyricsCandidate): LyricsProviderOption {
  return { provider: candidate.provider, syncLevel: candidate.syncLevel, quality: candidate.quality.total, candidate };
}

/**
 * One candidate per provider, keeping only the ones worth caching.
 * @param candidates - a later candidate of the same provider replaces an earlier one
 */
export function rankProviders(candidates: readonly (LyricsCandidate | null | undefined)[]): RankedProviders {
  const providers: Record<string, LyricsCandidate> = {};
  for (const candidate of candidates) {
    if (shouldCacheLyricsCandidate(candidate)) providers[providerKey(candidate.provider)] = candidate;
  }
  const options = Object.values(providers)
    .sort(compareLyricsCandidates)
    .map(toProviderOption);
  return { providers, options };
}
