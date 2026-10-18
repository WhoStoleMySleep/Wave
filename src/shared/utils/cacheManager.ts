import { waveDb } from "@/shared/storage/waveDb";
import {
  audioCache,
  DEFAULT_AUDIO_CACHE_LIMIT_BYTES,
  MIN_AUDIO_CACHE_LIMIT_BYTES,
} from "@/shared/storage/audioCache";
import { queryCache } from "@/shared/cache/queryCache";
import { lyricsCache } from "@/features/lyrics";
import { clearCoverRegistry } from "@/features/covers";
import { useSearchHistoryStore } from "@/features/search/store/searchHistoryStore";
import { debouncedStorage } from "@/shared/utils/storage";
import { useDownloadStore } from "@/features/downloads";

export { DEFAULT_AUDIO_CACHE_LIMIT_BYTES, MIN_AUDIO_CACHE_LIMIT_BYTES };

export function getAudioCacheLimitBytes(): number {
  return audioCache.getLimitBytes();
}

export async function setAudioCacheLimitBytes(bytes: number): Promise<void> {
  await audioCache.setLimitBytes(bytes);
}

const COVER_SW_CACHE = "wave-covers-v2";

const PRESERVED_STORAGE_KEYS = new Set([
  "wave_access_token",
  "wave_refresh_token",
  "wave_auth_session",
  "wave_locale",
  "theme",
]);

export type StorageCategoryId = "covers" | "audio" | "downloads" | "lyrics" | "metadata";

export interface StorageCategoryItem {
  id: StorageCategoryId;
  labelKey: string;
  bytes: number;
  count?: number;
  color: string;
}

export interface StorageAnalytics {
  categories: StorageCategoryItem[];
  totalBytes: number;
  audioCacheLimitBytes?: number;
  deviceQuotaBytes?: number;
  deviceUsageBytes?: number;
  deviceUsagePercent?: number;
  cachePath?: string;
}

/**
 * Clears cached network responses and cover image caches stored in CacheStorage and localStorage.
 */
export async function clearMediaAndCoverCache(): Promise<void> {
  clearCoverRegistry();
  if (typeof window !== "undefined" && "caches" in window) {
    try {
      const keys = await window.caches.keys();
      await Promise.all(keys.map((key) => window.caches.delete(key)));
    } catch {
      // Best-effort cache cleanup
    }
  }

  if (typeof window !== "undefined" && window.localStorage) {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key &&
        (key.startsWith("wave:playlist-covers") ||
          key.startsWith("wave:cover:") ||
          key.startsWith("wave:cache:"))
      ) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  }
}

/**
 * Clears search query caches and cached catalog lookups.
 */
export async function clearSearchAndQueryCache(): Promise<void> {
  queryCache.clear();
  try {
    useSearchHistoryStore.getState().clearHistory();
    debouncedStorage.removeItem("wave_search_history");
    debouncedStorage.flush();
  } catch {
    // Best-effort in non-store environments
  }

  if (typeof window !== "undefined" && window.localStorage) {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key &&
        (key.startsWith("wave:search:") ||
          key.startsWith("wave:query:") ||
          key.startsWith("wave_search_") ||
          key.startsWith("search-cache") ||
          key === "wave_search_history")
      ) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  }
}

/**
 * Clears temporary application cache while preserving auth and user settings.
 */
export async function clearApplicationCacheSafely(): Promise<void> {
  clearCoverRegistry();
  try {
    useSearchHistoryStore.getState().clearHistory();
    debouncedStorage.removeItem("wave_search_history");
    debouncedStorage.flush();
  } catch {}

  await Promise.all([
    clearMediaAndCoverCache(),
    clearSearchAndQueryCache(),
  ]);

  if (typeof window !== "undefined" && window.localStorage) {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && !PRESERVED_STORAGE_KEYS.has(key)) {
        if (
          key.startsWith("wave:") ||
          key.startsWith("lyrics-storage") ||
          key === "player-temp"
        ) {
          keysToRemove.push(key);
        }
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  }
}

// calculates approximate byte size of cover cache in serviceworker
async function getCoverCacheBytes(): Promise<{ bytes: number; count: number }> {
  if (typeof window === "undefined" || !("caches" in window)) {
    return { bytes: 0, count: 0 };
  }
  try {
    const hasCovers = await window.caches.has(COVER_SW_CACHE);
    if (!hasCovers) return { bytes: 0, count: 0 };
    const cache = await window.caches.open(COVER_SW_CACHE);
    const requests = await cache.keys();
    const count = requests.length;
    if (count === 0) return { bytes: 0, count: 0 };

    // sample up to 20 entries to avoid main thread jank with large catalogs
    const sampleLimit = Math.min(count, 20);
    let sampleBytes = 0;
    for (let i = 0; i < sampleLimit; i++) {
      const resp = await cache.match(requests[i]);
      if (resp) {
        const cl = resp.headers.get("content-length");
        if (cl) {
          sampleBytes += parseInt(cl, 10) || 0;
        } else {
          const blob = await resp.clone().blob();
          sampleBytes += blob.size;
        }
      }
    }
    const avg = sampleLimit > 0 ? sampleBytes / sampleLimit : 0;
    const estimated = Math.round(avg * count);
    return { bytes: estimated, count };
  } catch {
    return { bytes: 0, count: 0 };
  }
}

// gathers live analytics across indexeddb, caches, localstorage and the native layer
export async function getStorageAnalytics(): Promise<StorageAnalytics> {
  let audioBytes = 0;
  let downloadBytes = 0;
  let downloadCount = 0;
  let coversBytes = 0;
  let coversCount = 0;
  let lyricsBytes = 0;
  let metadataBytes = 0;
  let cachePath = "";

  // 1. native disk measurements (if running inside the desktop app)
  let nativeStats: {
    cacheSize: number;
    httpCacheSize: number;
    codeCacheSize: number;
    serviceWorkerSize: number;
    indexedDbSize: number;
    localStorageSize: number;
    blobStorageSize: number;
    cachePath: string;
  } | null = null;

  if (typeof window !== "undefined" && window.waveNative?.getCacheStats) {
    try {
      nativeStats = await window.waveNative.getCacheStats();
      if (nativeStats.cachePath) {
        cachePath = nativeStats.cachePath;
      }
    } catch {}
  }

  // 2. indexeddb audio tracks & metadata added in waveDb
  try {
    const audioTrackBytes = await waveDb.getTotalTrackBytes();
    const usage = await audioCache.getUsage();
    audioBytes = audioTrackBytes + usage.cacheBytes;
    downloadBytes = usage.downloadBytes;
    downloadCount = usage.downloadCount;
  } catch {}

  // take the maximum between indexeddb object store iteration and physical disk size
  // if indexeddb store is empty, ignore residual leveldb engine overhead under 2MB
  // downloads share the same disk files, so their exact size is subtracted first
  if (nativeStats && nativeStats.indexedDbSize > 0) {
    const totalIdbDisk = Math.max(
      0,
      nativeStats.indexedDbSize + (nativeStats.blobStorageSize || 0) - downloadBytes,
    );
    if (audioBytes > 0) {
      audioBytes = Math.max(audioBytes, totalIdbDisk);
    } else if (totalIdbDisk > 2 * 1024 * 1024) {
      audioBytes = totalIdbDisk;
    } else {
      audioBytes = 0;
    }
  }

  // 3. serviceworker covers added in cover-sw.js
  try {
    const coverStats = await getCoverCacheBytes();
    coversBytes = coverStats.bytes;
    coversCount = coverStats.count;
  } catch {}

  // physical disk size for service worker cache storage (only when covers exist or exceed 1MB)
  if (nativeStats && nativeStats.serviceWorkerSize > 0) {
    if (coversBytes > 0) {
      coversBytes = Math.max(coversBytes, nativeStats.serviceWorkerSize);
    } else if (nativeStats.serviceWorkerSize > 1024 * 1024) {
      coversBytes = nativeStats.serviceWorkerSize;
    } else {
      coversBytes = 0;
    }
  }

  // 4. lyrics cache added in lyricsCache.ts + waveDb lyrics
  try {
    const lBytes = await waveDb.getTotalLyricsBytes();
    const lStats = lyricsCache.getStats();
    lyricsBytes = lBytes + lStats.bytes;
  } catch {}

  // 5. in-memory catalog cache added in queryCache.ts + waveDb artists
  try {
    const qStats = queryCache.getStats();
    const aBytes = await waveDb.getTotalArtistBytes();
    metadataBytes += qStats.bytes + aBytes;
  } catch {}

  // 6. localstorage inspection for covers, search and metadata
  if (typeof window !== "undefined" && window.localStorage) {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const v = localStorage.getItem(k) || "";
      const size = (k.length + v.length) * 2;
      if (k.startsWith("wave:playlist-covers") || k.startsWith("wave:cover:")) {
        coversBytes += size;
      } else if (
        k.startsWith("wave:search:") ||
        k.startsWith("wave:query:") ||
        k.startsWith("wave_search_") ||
        k.startsWith("search-cache") ||
        k === "wave_search_history"
      ) {
        metadataBytes += size;
      } else if (k.startsWith("wave:artist:")) {
        metadataBytes += size;
      } else if (
        k.startsWith("wave_lyrics_") ||
        k.startsWith("lyrics-storage")
      ) {
        if (
          !k.startsWith("wave_lyrics_v2_item_") &&
          k !== "wave_lyrics_v2_index" &&
          !k.startsWith("wave_lyrics_item_") &&
          k !== "wave_lyrics_lru_index"
        ) {
          lyricsBytes += size;
        }
      }
    }
  }

  // 7. device quota estimate
  let deviceQuotaBytes: number | undefined;
  let deviceUsageBytes: number | undefined;
  let deviceUsagePercent: number | undefined;

  if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      deviceQuotaBytes = estimate.quota;
      deviceUsageBytes = estimate.usage;
      if (estimate.quota && estimate.quota > 0 && estimate.usage !== undefined) {
        deviceUsagePercent = Math.min(100, Math.max(0.01, (estimate.usage / estimate.quota) * 100));
      }
    } catch {}
  }

  const categories: StorageCategoryItem[] = [
    {
      id: "covers",
      labelKey: "settings.storage.categories.covers",
      bytes: coversBytes,
      count: coversCount,
      color: "#06B6D4", // cyan
    },
    {
      id: "audio",
      labelKey: "settings.storage.categories.audio",
      bytes: audioBytes,
      color: "#8B5CF6", // purple
    },
    {
      id: "downloads",
      labelKey: "settings.storage.categories.downloads",
      bytes: downloadBytes,
      count: downloadCount,
      color: "#10B981", // emerald
    },
    {
      id: "lyrics",
      labelKey: "settings.storage.categories.lyrics",
      bytes: lyricsBytes,
      color: "#EC4899", // pink
    },
    {
      id: "metadata",
      labelKey: "settings.storage.categories.metadata",
      bytes: metadataBytes,
      color: "#F59E0B", // amber
    },
  ];

  const totalBytes = categories.reduce((sum, c) => sum + c.bytes, 0);

  return {
    categories,
    totalBytes,
    audioCacheLimitBytes: audioCache.getLimitBytes(),
    deviceQuotaBytes,
    deviceUsageBytes,
    deviceUsagePercent,
    cachePath,
  };
}

// clears chosen categories cleanly while maintaining user session
export async function clearStorageCategories(categoryIds: StorageCategoryId[]): Promise<void> {
  const set = new Set(categoryIds);
  const isAllCategories =
    set.has("audio") &&
    set.has("downloads") &&
    set.has("covers") &&
    set.has("lyrics") &&
    set.has("metadata");

  if (set.has("downloads")) {
    const downloads = useDownloadStore.getState();
    downloads.cancelAll();
    const ids = (await waveDb.getDownloads()).map((record) => record.trackId);
    await downloads.remove(ids);
    await waveDb.clearStore("downloads");
  }

  if (set.has("audio")) {
    audioCache.revokeAll();
    await waveDb.clearStore("tracks");
    const hasDownloads = (await waveDb.getDownloadIds()).size > 0;
    if (hasDownloads) {
      // the native wipe deletes indexeddb blob files wholesale and would corrupt downloads
      await audioCache.clearUnpinned();
    } else {
      await waveDb.clearStore("audio");
      if (isAllCategories) {
        await waveDb.close();
      }
      if (typeof window !== "undefined" && window.waveNative?.clearAudioCache) {
        await window.waveNative.clearAudioCache(isAllCategories);
      }
    }
  }

  if (set.has("covers")) {
    await clearMediaAndCoverCache();
    if (typeof window !== "undefined" && window.waveNative?.clearCoversCache) {
      await window.waveNative.clearCoversCache();
    }
  }

  if (set.has("lyrics")) {
    lyricsCache.clear();
    await waveDb.clearStore("lyrics");
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.removeItem("lyrics-storage");
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("wave_lyrics_")) toRemove.push(k);
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
    }
  }

  if (set.has("metadata")) {
    queryCache.clear();
    await waveDb.clearStore("artists");
    await clearSearchAndQueryCache();
    if (typeof window !== "undefined" && window.localStorage) {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (
          k &&
          (k.startsWith("wave:artist:") ||
            k.startsWith("wave:search:") ||
            k.startsWith("wave:query:") ||
            k.startsWith("wave_search_") ||
            k.startsWith("search-cache") ||
            k === "wave_search_history")
        ) {
          toRemove.push(k);
        }
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
    }
  }

  if (typeof window !== "undefined" && window.waveNative?.clearHttpCache) {
    await window.waveNative.clearHttpCache();
  }
}

export async function openCacheFolder(): Promise<boolean> {
  if (typeof window !== "undefined" && window.waveNative?.openCacheFolder) {
    return window.waveNative.openCacheFolder();
  }
  return false;
}

// formats raw bytes into clean human readable format
export function formatStorageBytes(bytes: number): string {
  if (bytes <= 0 || !Number.isFinite(bytes)) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

const CACHE_ANALYTICS_STORAGE_KEY = "wave_cached_storage_analytics";

function readPersistedAnalytics(): StorageAnalytics | null {
  if (typeof window === "undefined" || !window.sessionStorage) return null;
  try {
    const raw = sessionStorage.getItem(CACHE_ANALYTICS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StorageAnalytics) : null;
  } catch {
    return null;
  }
}

function writePersistedAnalytics(data: StorageAnalytics): void {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    sessionStorage.setItem(CACHE_ANALYTICS_STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

let cachedStorageAnalytics: StorageAnalytics | null = readPersistedAnalytics();
let isStorageTabOpen = false;
let backgroundIntervalId: ReturnType<typeof setInterval> | null = null;
let isBackgroundUpdating = false;

// returns cached analytics synchronously if available
export function getCachedStorageAnalytics(): StorageAnalytics | null {
  return cachedStorageAnalytics;
}

// notifies background scheduler whether storage tab is open (pauses polling to prevent UI flicker)
export function setStorageTabOpen(isOpen: boolean): void {
  isStorageTabOpen = isOpen;
}

// performs background update of storage analytics
export async function refreshStorageAnalytics(): Promise<StorageAnalytics> {
  if (isBackgroundUpdating && cachedStorageAnalytics) {
    return cachedStorageAnalytics;
  }
  isBackgroundUpdating = true;
  try {
    const data = await getStorageAnalytics();
    cachedStorageAnalytics = data;
    writePersistedAnalytics(data);
    return data;
  } finally {
    isBackgroundUpdating = false;
  }
}

// initializes background polling (every 60s when storage tab is closed)
export function initBackgroundStorageAnalytics(): void {
  if (typeof window === "undefined") return;

  // non-blocking initial fetch 1.5s after launch
  setTimeout(() => {
    void refreshStorageAnalytics();
  }, 1500);

  // periodic background interval (60 seconds)
  if (!backgroundIntervalId) {
    backgroundIntervalId = setInterval(() => {
      // skip update if user currently has storage tab open so nothing blinks or jumps
      if (isStorageTabOpen) return;
      void refreshStorageAnalytics();
    }, 60_000);
  }
}

// automatically start in browser/desktop
if (typeof window !== "undefined") {
  initBackgroundStorageAnalytics();
}


