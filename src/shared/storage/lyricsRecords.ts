import type { LyricsCandidate } from "@/shared/contracts/lyrics";
import { rankProviders, shouldCacheLyricsCandidate } from "@/features/lyrics";
import type { CachedLyricsRecord } from "./records";

const BYTES_PER_CHAR = 2;

type ProviderMap = Record<string, LyricsCandidate>;

function providerKey(provider: string): string {
  return provider.toLowerCase().trim();
}

function candidatesOf(record: CachedLyricsRecord): LyricsCandidate[] {
  const options = (record.availableProviders ?? []).map((option) => option.candidate);
  return [...Object.values(record.providers ?? {}), record.candidate, ...options].filter(Boolean);
}

function byProvider(candidates: readonly LyricsCandidate[]): ProviderMap {
  return Object.fromEntries(candidates.map((candidate) => [providerKey(candidate.provider), candidate]));
}

/** Records written before `providers` existed keep their candidates only in the other fields. */
export function withProviders(record: CachedLyricsRecord): CachedLyricsRecord {
  if (record.providers) return record;
  return { ...record, providers: byProvider(candidatesOf(record)) };
}

/**
 * Keeps only the candidates worth caching and re-derives the summary fields from the primary one.
 * @returns the record to store, or null when no candidate is worth keeping
 */
export function toCacheableLyrics(record: CachedLyricsRecord): CachedLyricsRecord | null {
  const { providers, options } = rankProviders(candidatesOf(record));
  if (options.length === 0) return null;
  const primary = shouldCacheLyricsCandidate(record.candidate) ? record.candidate : options[0].candidate;
  return {
    ...record,
    syncLevel: primary.syncLevel,
    quality: primary.quality.total,
    activeProvider: primary.provider,
    rawLyrics: primary.lyrics.content,
    rawFormat: primary.lyrics.format,
    candidate: primary,
    providers,
    availableProviders: options,
  };
}

export function lyricsBytes(record: CachedLyricsRecord): number {
  const texts = record.providers ? Object.values(record.providers).map((c) => c.lyrics?.content) : [record.rawLyrics];
  return texts.reduce((sum, text) => sum + (text?.length ?? 0) * BYTES_PER_CHAR, 0);
}

export function jsonBytes(value: unknown): number {
  return (JSON.stringify(value)?.length ?? 0) * BYTES_PER_CHAR;
}
