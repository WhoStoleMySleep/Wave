import { log } from "@/shared/utils/logger";
import { moveLegacyDatabase } from "@/shared/storage/legacyStorage";

const DB_NAME = "wave_customization_db";
const LEGACY_DB_NAME = "liner_customization_db";
const STORE_NAME = "wallpapers";
const WALLPAPER_KEY = "active_wallpaper";

function settle<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function openDb(): Promise<IDBDatabase> {
  await moveLegacyDatabase(LEGACY_DB_NAME, DB_NAME);
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
  };
  return settle(request);
}

async function withStore(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<unknown> {
  if (typeof indexedDB === "undefined") return new Error("IndexedDB is unavailable");
  try {
    const db = await openDb();
    try {
      return await settle<unknown>(run(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME)));
    } finally {
      db.close();
    }
  } catch (error) {
    log("yellow", "wallpaper", `wallpaper ${mode} failed`, error);
    return error instanceof Error ? error : new Error(String(error));
  }
}

/** The wallpaper is too large for localStorage, so it lives in its own IndexedDB store. */
export async function loadPersistedWallpaper(): Promise<string | null> {
  const result = await withStore("readonly", (store) => store.get(WALLPAPER_KEY));
  return typeof result === "string" && result ? result : null;
}

export async function savePersistedWallpaper(image: string | null): Promise<void> {
  await withStore("readwrite", (store) => (image ? store.put(image, WALLPAPER_KEY) : store.delete(WALLPAPER_KEY)));
}
