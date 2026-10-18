import { useCallback, useSyncExternalStore } from "react";
import { loadSavedCover, saveCover } from "./coverStore";

type CoverStatus = "loading" | "loaded" | "error";

interface CoverEntry {
  status: CoverStatus;
  effectiveUrl?: string;
  promise: Promise<void>;
  element?: HTMLImageElement;
}

type LoadedCover = Pick<CoverEntry, "status" | "effectiveUrl" | "element">;

const entries = new Map<string, CoverEntry>();
const aliases = new Map<string, string>();
const listeners = new Map<string, Set<() => void>>();

function notify(url: string): void {
  listeners.get(url)?.forEach((listener) => listener());
}

function subscribe(url: string, listener: () => void): () => void {
  const set = listeners.get(url) ?? new Set();
  listeners.set(url, set);
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(url);
  };
}

/** A decoded cover is also looked up by the URL that actually loaded, which surfaces may hold instead of the primary one. */
function store(url: string, entry: CoverEntry): void {
  entries.set(url, entry);
  if (entry.effectiveUrl) aliases.set(entry.effectiveUrl, url);
  if (entry.element?.src) aliases.set(entry.element.src, url);
}

function settle(url: string, cover: LoadedCover): void {
  const entry = entries.get(url);
  if (entry) store(url, { ...entry, ...cover });
  notify(url);
}

/** True once the cover has successfully decoded (a strict, no-fade success). */
export function isCoverReady(url: string | undefined): boolean {
  return !!url && entries.get(url)?.status === "loaded";
}

export function clearCoverRegistry(): void {
  entries.clear();
  aliases.clear();
  listeners.forEach((set) => set.forEach((listener) => listener()));
}

function loadedElement(entry: CoverEntry | undefined): HTMLImageElement | undefined {
  return entry?.status === "loaded" ? entry.element : undefined;
}

export function getCoverElement(url: string | undefined): HTMLImageElement | undefined {
  if (!url) return undefined;
  const alias = aliases.get(url);
  return loadedElement(entries.get(url)) ?? (alias ? loadedElement(entries.get(alias)) : undefined);
}

/** A cover that 404s still settles, so its placeholder stops pulsing instead of loading forever. */
function isCoverSettled(url: string | undefined): boolean {
  if (!url) return true;
  const status = entries.get(url)?.status;
  return status === "loaded" || status === "error";
}

/**
 * Records a cover an `<img>` decoded by itself, so it fills the same registry a preload would.
 * `effectiveUrl` is the URL that actually decoded, which `useCoverSrc` consumers then pick up.
 */
export function markCoverReady(url: string | undefined, effectiveUrl?: string, element?: HTMLImageElement): void {
  if (!url) return;
  const resolved = effectiveUrl ?? url;
  void saveCover(url, resolved);
  const entry = entries.get(url);
  const changed = entry?.status !== "loaded" || entry.effectiveUrl !== resolved || (!entry.element && Boolean(element));
  store(url, { promise: entry?.promise ?? Promise.resolve(), status: "loaded", effectiveUrl: resolved, element: element ?? entry?.element });
  if (changed) notify(url);
}

/** @returns the decoded image, trying the copy saved on an earlier run once the direct URL fails, or null when neither loads */
function decode(url: string): Promise<HTMLImageElement | null> {
  const image = new window.Image();
  image.crossOrigin = "anonymous";
  image.decoding = "async";
  return new Promise((resolve) => {
    let triedSaved = false;
    image.onload = () => resolve(image);
    image.onerror = async () => {
      const saved = triedSaved ? null : await loadSavedCover(url);
      triedSaved = true;
      if (saved) image.src = saved;
      else resolve(null);
    };
    image.src = url;
  });
}

/**
 * Loads a cover once for every surface that shows it, so they share one cache entry instead of racing
 * with different request modes. Always a CORS request: the WebGL background needs an untainted texture
 * and the mini player samples pixels for its accent color, and the cover CDNs allow any origin.
 * A failed load is retried on the next call; readiness stays keyed by the primary URL.
 */
export function preloadCoverArt(url: string | undefined): Promise<void> {
  if (!url || typeof window === "undefined") return Promise.resolve();
  const existing = entries.get(url);
  if (existing && existing.status !== "error") return existing.promise;
  const promise = decode(url).then((image) => {
    if (!image) return settle(url, { status: "error" });
    void saveCover(url, image.src);
    settle(url, { status: "loaded", effectiveUrl: image.src, element: image });
  });
  entries.set(url, { status: "loading", promise });
  return promise;
}

/** Subscribing starts the load, so rendering a cover is enough to fetch it. */
function useCoverSnapshot<T>(url: string | undefined, read: (url: string | undefined) => T, serverValue: T): T {
  const subscribeToUrl = useCallback(
    (onChange: () => void) => {
      if (!url) return () => {};
      void preloadCoverArt(url);
      return subscribe(url, onChange);
    },
    [url],
  );
  return useSyncExternalStore(subscribeToUrl, () => read(url), () => serverValue);
}

/** True as soon as the cover has settled; synchronously true for a cached cover, so revisits show no placeholder or fade. */
export function useCoverReady(url: string | undefined): boolean {
  return useCoverSnapshot(url, isCoverSettled, false);
}

/**
 * The URL to render for surfaces that cannot swap on a load error themselves (CSS backgrounds, the
 * WebGL texture): the direct URL first, then the saved copy once the direct one has failed.
 */
export function useCoverSrc(url: string | undefined): string | undefined {
  return useCoverSnapshot(url, (key) => (key ? (entries.get(key)?.effectiveUrl ?? key) : undefined), url);
}

/** The decoded image once ready, so the WebGL layer can upload its pixels without another request. */
export function useCoverElement(url: string | undefined): HTMLImageElement | undefined {
  return useCoverSnapshot(url, getCoverElement, undefined);
}
