import { waveDb } from "@/shared/storage";
import { log } from "@/shared/utils/logger";

const MAX_COVER_BYTES = 2 * 1024 * 1024;
const MAX_SAVED_COVERS = 1000;
const TRIM_EVERY = 50;

const saved = new Set<string>();
const objectUrls = new Map<string, Promise<string | null>>();
let savesSinceTrim = 0;

function isRemote(url: string): boolean {
  return url.startsWith("https://") || url.startsWith("http://");
}

/** Covers are 10–100 KB; anything bigger is not a thumbnail and not worth keeping. */
function isThumbnail(blob: Blob): boolean {
  return blob.type.startsWith("image/") && blob.size > 0 && blob.size <= MAX_COVER_BYTES;
}

async function trimEveryFewSaves(): Promise<void> {
  if (++savesSinceTrim < TRIM_EVERY) return;
  savesSinceTrim = 0;
  await waveDb.trimCovers(MAX_SAVED_COVERS);
}

async function fetchAndSave(url: string, sourceUrl: string): Promise<void> {
  if (await waveDb.hasCover(url)) return;
  const response = await fetch(sourceUrl, { mode: "cors", cache: "force-cache" });
  if (!response.ok) throw new Error(`cover responded ${response.status}`);
  const blob = await response.blob();
  if (!isThumbnail(blob)) return;
  await waveDb.putCover(url, blob);
  await trimEveryFewSaves();
}

/**
 * Keeps a copy of a cover that just decoded so it still shows offline: the apps run without the cover
 * service worker, and the WebView's HTTP cache does not survive a cold start without network.
 * `force-cache` lets the request be served from the cache the `<img>` just filled.
 */
export async function saveCover(url: string, sourceUrl: string = url): Promise<void> {
  if (!isRemote(url) || !isRemote(sourceUrl) || saved.has(url)) return;
  saved.add(url);
  try {
    await fetchAndSave(url, sourceUrl);
  } catch (error) {
    log("yellow", "covers", `saving cover ${url} failed`, error);
    saved.delete(url);
  }
}

async function readSavedCover(url: string): Promise<string | null> {
  try {
    const record = await waveDb.getCover(url);
    return record ? URL.createObjectURL(record.blob) : null;
  } catch (error) {
    log("yellow", "covers", `reading saved cover ${url} failed`, error);
    return null;
  }
}

/** @returns an object URL of the saved copy, or null when the cover was never saved; a miss is asked again next time */
export function loadSavedCover(url: string): Promise<string | null> {
  const cached = objectUrls.get(url);
  if (cached) return cached;
  const pending = readSavedCover(url);
  objectUrls.set(url, pending);
  void pending.then((objectUrl) => {
    if (!objectUrl) objectUrls.delete(url);
  });
  return pending;
}
