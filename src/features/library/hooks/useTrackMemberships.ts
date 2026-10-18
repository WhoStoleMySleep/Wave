import { useEffect, useSyncExternalStore } from "react";
import { api, ApiError } from "@/shared/api";
import { notifyLibraryChanged } from "./usePlaylists";

/** Playlist id → item id of the track in it; the item id is what removing it takes. */
export type TrackMemberships = ReadonlyMap<string, string>;

const memberships = new Map<string, TrackMemberships>();
const watchers = new Map<string, number>();
const requests = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setMemberships(trackId: string, next: TrackMemberships) {
  memberships.set(trackId, next);
  emit();
}

function fetchMemberships(trackId: string): Promise<void> {
  const pending = requests.get(trackId);
  if (pending) return pending;
  const request = api
    .getTrackSaved(trackId)
    .then((saved) => {
      setMemberships(
        trackId,
        new Map(saved.playlists.map((entry) => [entry.playlistId, entry.itemId])),
      );
    })
    .catch(() => {
      // offline the previous answer is still the best guess; a 409 on add corrects it
    })
    .finally(() => requests.delete(trackId));
  requests.set(trackId, request);
  return request;
}

if (typeof window !== "undefined") {
  const refresh = () => {
    for (const trackId of [...memberships.keys()]) {
      if (!watchers.has(trackId)) memberships.delete(trackId);
    }
    for (const trackId of watchers.keys()) void fetchMemberships(trackId);
  };
  window.addEventListener("library:changed", refresh);
  window.addEventListener("auth:changed", () => {
    memberships.clear();
    refresh();
  });
}

/**
 * Which of the user's playlists hold a track, kept fresh on library changes.
 * `null` until the first answer arrives.
 */
export function useTrackMemberships(trackId: string | undefined): TrackMemberships | null {
  useEffect(() => {
    if (!trackId) return;
    watchers.set(trackId, (watchers.get(trackId) ?? 0) + 1);
    if (!memberships.has(trackId)) void fetchMemberships(trackId);
    return () => {
      const count = (watchers.get(trackId) ?? 1) - 1;
      if (count > 0) watchers.set(trackId, count);
      else watchers.delete(trackId);
    };
  }, [trackId]);

  return useSyncExternalStore(
    subscribe,
    () => (trackId ? memberships.get(trackId) ?? null : null),
    () => null,
  );
}

/**
 * Adds a track to a playlist and records the membership right away so the
 * player button flips without waiting for the refetch. A track that turns out
 * to be there already counts as added.
 */
export async function addTrackToPlaylist(playlistId: string, trackId: string): Promise<void> {
  try {
    const item = await api.addPlaylistTrack(playlistId, trackId);
    const next = new Map(memberships.get(trackId) ?? []);
    next.set(playlistId, item.id);
    setMemberships(trackId, next);
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 409)) throw error;
  }
  notifyLibraryChanged();
}

export async function removeTrackFromPlaylist(playlistId: string, trackId: string): Promise<void> {
  if (!memberships.get(trackId)?.has(playlistId)) await fetchMemberships(trackId);
  const current = memberships.get(trackId);
  const itemId = current?.get(playlistId);
  if (!current || !itemId) return;
  const next = new Map(current);
  next.delete(playlistId);
  setMemberships(trackId, next);
  try {
    await api.removePlaylistItem(playlistId, itemId);
  } catch (error) {
    setMemberships(trackId, current);
    throw error;
  }
  notifyLibraryChanged();
}
