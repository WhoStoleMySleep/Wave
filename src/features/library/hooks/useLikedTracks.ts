import { useEffect, useSyncExternalStore } from "react";
import { api, toClientTrack } from "@/shared/api";
import type { Track } from "@/shared/types";
import { useDownloadStore } from "@/features/downloads/store/downloadStore";
import { LibraryResource } from "./libraryResource";

interface LikedData {
  tracks: Track[];
  total: number;
}

const PAGE_SIZE = 100;
export const LIKED_COLLECTION_ID = "likes";
const EMPTY: LikedData = { tracks: [], total: 0 };

const overrides = new Map<string, boolean>();
const idSets = new WeakMap<LikedData, Set<string>>();

async function fetchLikedTracks(): Promise<LikedData> {
  const tracks: Track[] = [];
  let cursor: string | undefined;
  do {
    const page = await api.listLikedTracks(PAGE_SIZE, cursor);
    tracks.push(...page.items.map(({ track, likedAt }) => ({ ...toClientTrack(track), addedAt: likedAt })));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return { tracks, total: tracks.length };
}

function placeholder(id: string): Track {
  return { id, title: "", artists: "", coverUrl: "", durationMs: 0, playCount: 0 };
}

/** The newest optimistic like goes first, as the server will list it once the like lands. */
function withOverrides(data: LikedData): LikedData {
  if (overrides.size === 0) return data;
  const kept = data.tracks.filter((track) => overrides.get(track.id) !== false);
  const present = new Set(kept.map((track) => track.id));
  const added = [...overrides]
    .filter(([id, liked]) => liked && !present.has(id))
    .map(([id]) => placeholder(id))
    .reverse();
  const tracks = [...added, ...kept];
  return { tracks, total: tracks.length };
}

const liked = new LibraryResource<LikedData>({
  snapshotKey: "library:liked",
  empty: EMPTY,
  fetch: fetchLikedTracks,
  isEmpty: (data) => data.tracks.length === 0,
  present: withOverrides,
  onLoaded: (data) => {
    overrides.clear();
    void useDownloadStore.getState().syncCollection(LIKED_COLLECTION_ID, data.tracks);
  },
  onCleared: () => overrides.clear(),
});
liked.watch();

function likedIds(data: LikedData): Set<string> {
  const cached = idSets.get(data);
  if (cached) return cached;
  const ids = new Set(data.tracks.map((track) => track.id));
  idSets.set(data, ids);
  return ids;
}

/** @returns a rollback that restores the like state from before this change */
export function applyOptimisticLike(trackId: string, isLiked = true): () => void {
  const previous = overrides.get(trackId);
  overrides.set(trackId, isLiked);
  liked.publish();
  return () => {
    if (previous === undefined) overrides.delete(trackId);
    else overrides.set(trackId, previous);
    liked.publish();
  };
}

export function applyOptimisticUnlike(trackId: string): () => void {
  return applyOptimisticLike(trackId, false);
}

/** Like state outside React, for native media controls. */
export function isTrackLiked(trackId: string): boolean {
  return likedIds(liked.getView().data).has(trackId);
}

export function subscribeLikedTracks(listener: () => void): () => void {
  void liked.load();
  return liked.subscribe(listener);
}

export function useLikedTracks() {
  const state = useSyncExternalStore(liked.subscribe, liked.getView, () => liked.serverView);
  useEffect(() => {
    void liked.load();
  }, []);
  return state;
}

export function useLikedTrackCount() {
  const { data, isLoading } = useLikedTracks();
  return { data: data.total, isLoading };
}
