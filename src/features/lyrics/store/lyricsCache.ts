import type { LyricsCandidate } from "@/shared/contracts/lyrics";
import { log } from "@/shared/utils/logger";
import {
  isBetterLyricsCandidate,
  providerKey,
  rankProviders,
  shouldCacheLyricsCandidate,
  type LyricsProviderOption,
  type RankedProviders,
} from "../lib/candidateRanking";

export interface CachedLyricsItem {
  trackId: string;
  candidate: LyricsCandidate;
  providers?: Record<string, LyricsCandidate>;
  availableProviders?: LyricsProviderOption[];
  timestamp: number;
}

const INDEX_KEY = "wave_lyrics_v2_index";
const ITEM_PREFIX = "wave_lyrics_v2_item_";
const LEGACY_INDEX_KEY = "wave_lyrics_lru_index";
const LEGACY_ITEM_PREFIX = "wave_lyrics_item_";
const MAX_ENTRIES = 250;
const EVICTED_ON_QUOTA = 20;
const BYTES_PER_CHAR = 2;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch (error) {
    log("yellow", "lyrics", "localStorage is blocked, lyrics are not cached", error);
    return null;
  }
}

function readJson(key: string): unknown {
  const raw = storage()?.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    log("yellow", "lyrics", `unreadable cache entry ${key}`, error);
    return null;
  }
}

function write(key: string, value: string): boolean {
  try {
    storage()?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function purgeLegacyIndex(): void {
  if (!storage()?.getItem(LEGACY_INDEX_KEY)) return;
  const legacy = readJson(LEGACY_INDEX_KEY);
  if (Array.isArray(legacy)) legacy.forEach((id) => storage()?.removeItem(LEGACY_ITEM_PREFIX + id));
  storage()?.removeItem(LEGACY_INDEX_KEY);
}

function storedCandidates(item: CachedLyricsItem | null): LyricsCandidate[] {
  return Object.values(item?.providers ?? {});
}

function toItem(trackId: string, ranked: RankedProviders, primary: LyricsCandidate): CachedLyricsItem {
  return { trackId, candidate: primary, providers: ranked.providers, availableProviders: ranked.options, timestamp: Date.now() };
}

function rebuild(stored: CachedLyricsItem): CachedLyricsItem | null {
  const options = (stored.availableProviders ?? []).map((option) => option.candidate);
  const ranked = rankProviders([stored.candidate, ...options, ...storedCandidates(stored)]);
  if (ranked.options.length === 0) return null;
  const primary = shouldCacheLyricsCandidate(stored.candidate) ? stored.candidate : ranked.options[0].candidate;
  return { ...toItem(stored.trackId, ranked, primary), timestamp: stored.timestamp || Date.now() };
}

class LyricsCache {
  private readonly items = new Map<string, CachedLyricsItem>();
  private order: Set<string> | null = null;
  private newest: string | null = null;

  public get(trackId: string): CachedLyricsItem | null {
    const item = this.items.get(trackId) ?? this.load(trackId);
    if (item) this.touch(trackId);
    return item;
  }

  public getProvider(trackId: string, provider: string): LyricsCandidate | null {
    return this.get(trackId)?.providers?.[providerKey(provider)] ?? null;
  }

  public has(trackId: string, provider?: string): boolean {
    return provider ? this.getProvider(trackId, provider) !== null : this.get(trackId) !== null;
  }

  /** Stores the shown lyrics with every provider found; `candidate` stays primary when it is worth caching. */
  public set(trackId: string, candidate: LyricsCandidate, availableProviders: LyricsProviderOption[] = []): void {
    const found = availableProviders.map((option) => option.candidate);
    const ranked = rankProviders([...storedCandidates(this.get(trackId)), candidate, ...found]);
    if (ranked.options.length === 0) return;
    const primary = shouldCacheLyricsCandidate(candidate) ? candidate : ranked.options[0].candidate;
    this.remember(toItem(trackId, ranked, primary));
  }

  /** Adds one provider's lyrics; it becomes primary only when it beats the current one. */
  public setProvider(trackId: string, candidate: LyricsCandidate): void {
    if (!shouldCacheLyricsCandidate(candidate)) return;
    const existing = this.get(trackId);
    const ranked = rankProviders([...storedCandidates(existing), candidate]);
    const current = shouldCacheLyricsCandidate(existing?.candidate) ? existing.candidate : null;
    const primary = current && !isBetterLyricsCandidate(candidate, current) ? current : ranked.options[0].candidate;
    this.remember(toItem(trackId, ranked, primary));
  }

  public clear(): void {
    this.lru().forEach((trackId) => storage()?.removeItem(ITEM_PREFIX + trackId));
    this.lru().clear();
    this.items.clear();
    this.newest = null;
    this.saveOrder();
  }

  public getStats(): { count: number; bytes: number } {
    const index = storage()?.getItem(INDEX_KEY) ?? "";
    let chars = index ? INDEX_KEY.length + index.length : 0;
    for (const trackId of this.lru()) {
      const raw = storage()?.getItem(ITEM_PREFIX + trackId);
      if (raw) chars += ITEM_PREFIX.length + trackId.length + raw.length;
    }
    return { count: this.lru().size, bytes: chars * BYTES_PER_CHAR };
  }

  private lru(): Set<string> {
    if (this.order) return this.order;
    purgeLegacyIndex();
    const index = readJson(INDEX_KEY);
    this.order = new Set(Array.isArray(index) ? index.map(String) : []);
    return this.order;
  }

  private load(trackId: string): CachedLyricsItem | null {
    const stored = readJson(ITEM_PREFIX + trackId) as CachedLyricsItem | null;
    const item = stored?.trackId ? rebuild(stored) : null;
    if (item) this.items.set(trackId, item);
    return item;
  }

  private remember(item: CachedLyricsItem): void {
    this.items.set(item.trackId, item);
    this.persist(item);
    this.touch(item.trackId);
  }

  private persist(item: CachedLyricsItem): void {
    const key = ITEM_PREFIX + item.trackId;
    const raw = JSON.stringify(item);
    if (write(key, raw)) return;
    this.evict(EVICTED_ON_QUOTA);
    this.saveOrder();
    if (!write(key, raw)) log("yellow", "lyrics", `no room to cache lyrics of ${item.trackId}`);
  }

  private touch(trackId: string): void {
    if (this.newest === trackId) return;
    const lru = this.lru();
    lru.delete(trackId);
    lru.add(trackId);
    this.newest = trackId;
    this.evict(lru.size - MAX_ENTRIES);
    this.saveOrder();
  }

  private evict(count: number): void {
    if (count <= 0) return;
    const lru = this.lru();
    for (const trackId of [...lru].slice(0, count)) {
      lru.delete(trackId);
      this.items.delete(trackId);
      storage()?.removeItem(ITEM_PREFIX + trackId);
    }
    if (this.newest !== null && !lru.has(this.newest)) this.newest = null;
  }

  private saveOrder(): void {
    if (!write(INDEX_KEY, JSON.stringify([...this.lru()]))) log("yellow", "lyrics", "lyrics cache index not saved");
  }
}

export const lyricsCache = new LyricsCache();
