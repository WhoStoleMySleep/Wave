import { getAuthSession } from "@/shared/api";
import { waveDb } from "@/shared/storage";
import { log } from "@/shared/utils/logger";

/**
 * Snapshots are scoped to the signed-in user, so after switching accounts the
 * previous user's library never flashes on screen.
 */
function scopedKey(key: string): string | null {
  const userId = getAuthSession()?.user?.id;
  return userId ? `${userId}:${key}` : null;
}

/** Last saved copy of a library response, or null when there is none or storage is unavailable. */
export async function readLibrarySnapshot<T>(key: string): Promise<T | null> {
  const scoped = scopedKey(key);
  if (!scoped) return null;
  try {
    return (await waveDb.getSnapshot<T>(scoped))?.data ?? null;
  } catch (error) {
    log("yellow", "library", `reading snapshot ${key} failed`, error);
    return null;
  }
}

export function writeLibrarySnapshot<T>(key: string, data: T): void {
  const scoped = scopedKey(key);
  if (scoped) void waveDb.putSnapshot(scoped, data).catch((error: unknown) => log("yellow", "library", `saving snapshot ${key} failed`, error));
}

export function deleteLibrarySnapshot(key: string): void {
  const scoped = scopedKey(key);
  if (scoped) void waveDb.deleteSnapshot(scoped).catch((error: unknown) => log("yellow", "library", `deleting snapshot ${key} failed`, error));
}
