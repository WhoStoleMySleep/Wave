import { api, type LyricsCandidate, type LyricsStreamEvent } from "@/shared/api";
import {
  compareLyricsCandidates,
  isBetterLyricsCandidate,
  lyricsCache,
  lyricsPatchFor,
  shouldCacheLyricsCandidate,
  toProviderOption,
  useLyricsStore,
  type CachedLyricsItem,
  type LyricsPatch,
  type LyricsProviderOption,
} from "@/features/lyrics";
import { waveDb, type CachedLyricsRecord } from "@/shared/storage";
import { log } from "@/shared/utils/logger";
import type { Track } from "@/shared/types";
import { errorMessage } from "./engineUtils";

type CachedLyrics = CachedLyricsItem | CachedLyricsRecord;
type FoundEvent = Extract<LyricsStreamEvent, { type: "provider"; status: "found" }>;
type DoneEvent = Extract<LyricsStreamEvent, { type: "done" }>;

interface LoadRequest {
  token: number;
  signal: AbortSignal;
}

interface CollectedLyrics {
  best: LyricsCandidate | null;
  providers: LyricsProviderOption[];
}

const FRESH_FOR_MS = 7 * 24 * 60 * 60 * 1000;
const PREFETCH_TIMEOUT_MS = 8000;
const LOAD_ERROR = "Failed to load lyrics.";

const EMPTY_LYRICS: LyricsPatch = {
  rawLyrics: null,
  rawFormat: null,
  braccatoLyrics: [],
  syncedLines: [],
  plainLyrics: null,
  lyricsQuality: 0,
  activeProvider: null,
  availableProviders: [],
};

const setLyricsState = (patch: LyricsPatch) => useLyricsStore.getState().setLyricsState(patch);

/** @returns a new list with `option` in place of its provider's row, best first */
export function mergeProvider(providers: readonly LyricsProviderOption[], option: LyricsProviderOption): LyricsProviderOption[] {
  return [...providers.filter((item) => item.provider !== option.provider), option].sort((a, b) =>
    compareLyricsCandidates(a.candidate, b.candidate),
  );
}

export function lyricsStateFor(candidate: LyricsCandidate, providers: LyricsProviderOption[]): LyricsPatch {
  return { ...lyricsPatchFor(candidate), availableProviders: providers };
}

/** Lyrics the user picked are never refreshed; others are rechecked after a week. */
export function needsRefresh(cached: CachedLyrics, now = Date.now()): boolean {
  if ("userLocked" in cached && cached.userLocked) return false;
  const checkedAt = "lastCheckedAt" in cached ? cached.lastCheckedAt : cached.timestamp;
  return now - (checkedAt || 0) >= FRESH_FOR_MS;
}

function isFoundEvent(event: LyricsStreamEvent): event is FoundEvent {
  return event.type === "provider" && event.status === "found";
}

function persistLyrics(trackId: string, candidate: LyricsCandidate, providers: LyricsProviderOption[]): void {
  if (!shouldCacheLyricsCandidate(candidate)) return;
  lyricsCache.set(trackId, candidate, providers);
  const now = Date.now();
  void waveDb.putLyrics({
    trackId,
    syncLevel: candidate.syncLevel,
    quality: candidate.quality.total,
    activeProvider: candidate.provider,
    availableProviders: providers,
    rawLyrics: candidate.lyrics.content,
    rawFormat: candidate.lyrics.format,
    candidate,
    lastCheckedAt: now,
    updatedAt: now,
  });
}

function rememberProvider(trackId: string, candidate: LyricsCandidate): void {
  if (shouldCacheLyricsCandidate(candidate)) lyricsCache.setProvider(trackId, candidate);
}

async function readStoredLyrics(trackId: string): Promise<CachedLyricsRecord | null> {
  try {
    return await waveDb.getLyrics(trackId);
  } catch (error) {
    log("yellow", "lyrics", `stored lyrics unreadable: ${errorMessage(error)}`);
    return null;
  }
}

async function readCachedLyrics(trackId: string): Promise<CachedLyrics | null> {
  return lyricsCache.get(trackId) ?? (await readStoredLyrics(trackId));
}

function showLyrics(trackId: string, cached: CachedLyrics): void {
  const providers = cached.availableProviders ?? [toProviderOption(cached.candidate)];
  setLyricsState({
    ...lyricsStateFor(cached.candidate, providers),
    lyricsLoading: false,
    lyricsError: null,
    currentLyricsTrackId: trackId,
  });
}

async function collectCandidates(trackId: string): Promise<CollectedLyrics> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PREFETCH_TIMEOUT_MS);
  const providers: LyricsProviderOption[] = [];
  let best: LyricsCandidate | null = null;
  try {
    for await (const event of api.streamLyrics(trackId, controller.signal)) {
      if (event.type === "done") break;
      if (!isFoundEvent(event)) continue;
      rememberProvider(trackId, event.candidate);
      providers.push(toProviderOption(event.candidate));
      if (!best || isBetterLyricsCandidate(event.candidate, best)) best = event.candidate;
    }
  } finally {
    clearTimeout(timeout);
  }
  return { best, providers };
}

export class LyricsLoader {
  private loadToken = 0;
  private abort: AbortController | null = null;
  private currentTrackId: string | null = null;
  private best: LyricsCandidate | null = null;
  private readonly inFlight = new Map<string, Promise<void>>();

  /** Shows cached lyrics at once and streams better ones; a newer call cancels an older one. */
  async load(track: Track | null): Promise<void> {
    if (!track) {
      this.currentTrackId = null;
      useLyricsStore.getState().reset();
      return;
    }
    if (this.isShowing(track.id)) return;
    const request = this.beginRequest(track.id);
    const cached = await readCachedLyrics(track.id);
    if (!this.isCurrent(request)) return;
    if (cached) {
      this.showCached(track, cached);
      if (!needsRefresh(cached)) return;
      void waveDb.updateLyricsChecked(track.id);
    } else {
      setLyricsState({ ...EMPTY_LYRICS, lyricsLoading: true, lyricsError: null, currentLyricsTrackId: track.id });
    }
    if (await this.adoptPrefetch(track.id, request)) return;
    await this.stream(track, request, cached !== null);
  }

  /** Downloads lyrics of the next track unless they are cached and fresh; parallel calls share one request. */
  prefetch(trackId: string): Promise<void> {
    if (!trackId || lyricsCache.has(trackId)) return Promise.resolve();
    const pending = this.inFlight.get(trackId);
    if (pending) return pending;
    const task = this.prefetchStale(trackId).finally(() => this.inFlight.delete(trackId));
    this.inFlight.set(trackId, task);
    return task;
  }

  private async prefetchStale(trackId: string): Promise<void> {
    try {
      const stored = await waveDb.getLyrics(trackId);
      if (stored && !needsRefresh(stored)) return;
      const { best, providers } = await collectCandidates(trackId);
      if (best) persistLyrics(trackId, best, providers);
    } catch (error) {
      log("yellow", "lyrics", `prefetch failed: ${errorMessage(error)}`);
    }
  }

  private isShowing(trackId: string): boolean {
    return this.currentTrackId === trackId && useLyricsStore.getState().currentLyricsTrackId === trackId;
  }

  private beginRequest(trackId: string): LoadRequest {
    this.currentTrackId = trackId;
    this.best = null;
    this.abort?.abort();
    this.abort = new AbortController();
    return { token: ++this.loadToken, signal: this.abort.signal };
  }

  private isCurrent(request: LoadRequest): boolean {
    return request.token === this.loadToken && !request.signal.aborted;
  }

  private showCached(track: Track, cached: CachedLyrics): void {
    this.best = cached.candidate;
    showLyrics(track.id, cached);
    log("cyan", "lyrics", `cache hit for "${track.title}"`);
  }

  private async adoptPrefetch(trackId: string, request: LoadRequest): Promise<boolean> {
    const pending = this.inFlight.get(trackId);
    if (!pending) return false;
    await pending;
    if (!this.isCurrent(request)) return true;
    const fresh = await readCachedLyrics(trackId);
    if (!this.isCurrent(request)) return true;
    if (!fresh) return false;
    this.best = fresh.candidate;
    showLyrics(trackId, fresh);
    return true;
  }

  private async stream(track: Track, request: LoadRequest, hasCached: boolean): Promise<void> {
    log("cyan", "lyrics", `fetching for "${track.title}"`);
    try {
      for await (const event of api.streamLyrics(track.id, request.signal)) {
        if (!this.isCurrent(request)) break;
        if (event.type === "done") {
          this.finishStream(track.id, event);
          break;
        }
        if (isFoundEvent(event)) this.applyCandidate(track.id, event.candidate);
        else if (event.type === "provider" && event.status === "error") {
          log("yellow", "lyrics", `provider ${event.provider} error: ${event.message}`);
        }
      }
    } catch (error) {
      this.reportStreamError(error, request, hasCached);
    } finally {
      if (request.token === this.loadToken) setLyricsState({ lyricsLoading: false });
    }
  }

  private applyCandidate(trackId: string, candidate: LyricsCandidate): void {
    const providers = mergeProvider(useLyricsStore.getState().availableProviders, toProviderOption(candidate));
    rememberProvider(trackId, candidate);
    const quality = `${candidate.provider} q=${candidate.quality.total}`;
    if (this.best && !isBetterLyricsCandidate(candidate, this.best)) {
      setLyricsState({ availableProviders: providers });
      log("yellow", "lyrics", `skip worse candidate ${quality}`);
      return;
    }
    this.best = candidate;
    setLyricsState(lyricsStateFor(candidate, providers));
    persistLyrics(trackId, candidate, providers);
    log("green", "lyrics", `candidate ${quality} sync=${candidate.syncLevel}`);
  }

  private finishStream(trackId: string, event: DoneEvent): void {
    if (this.best) persistLyrics(trackId, this.best, useLyricsStore.getState().availableProviders);
    const summary = event.best ? `best=${event.best.provider} q=${event.best.quality}` : "no lyrics found";
    log("cyan", "lyrics", `done, ${summary}`);
  }

  private reportStreamError(error: unknown, request: LoadRequest, hasCached: boolean): void {
    if (!this.isCurrent(request)) return;
    log("red", "lyrics", `stream failed: ${errorMessage(error)}`);
    if (!hasCached) setLyricsState({ lyricsError: LOAD_ERROR });
  }
}
