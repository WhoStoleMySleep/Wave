import { useCallback, useState } from "react";
import { api } from "@/shared/api";
import { log } from "@/shared/utils/logger";
import { notifyLibraryChanged, evictPlaylistFromCache } from "./usePlaylists";
import { applyOptimisticLike, isTrackLiked } from "./useLikedTracks";

export interface MutationCallbacks<R> {
  onSuccess?: (result: R) => void;
  onError?: (error: unknown) => void;
  onSettled?: () => void;
}

type CollectionType = "album" | "artist" | "playlist";

interface PlaylistTrackInput {
  playlistId: string;
  trackId: string;
}

interface PlaylistItemInput {
  playlistId: string;
  itemId: string;
}

interface ReorderInput extends PlaylistItemInput {
  beforeItemId: string | null;
  revision: number;
}

interface CollectionInput {
  type: CollectionType;
  id: string;
}

interface RemoveCollectionInput extends CollectionInput {
  isOwned?: boolean;
}

/** Reports a failure to `onError`, or logs it when nobody listens. */
async function settle<R>(work: Promise<R>, callbacks: MutationCallbacks<R>): Promise<void> {
  try {
    const result = await work;
    callbacks.onSuccess?.(result);
  } catch (error) {
    if (callbacks.onError) callbacks.onError(error);
    else log("yellow", "library", "library change failed", error);
  } finally {
    callbacks.onSettled?.();
  }
}

function useMutation<T, R>(action: (input: T) => Promise<R>) {
  const [isPending, setIsPending] = useState(false);
  const mutateAsync = useCallback(
    async (input: T): Promise<R> => {
      setIsPending(true);
      try {
        return await action(input);
      } finally {
        setIsPending(false);
      }
    },
    [action],
  );
  const mutate = useCallback(
    (input: T, callbacks: MutationCallbacks<R> = {}) => void settle(mutateAsync(input), callbacks),
    [mutateAsync],
  );
  return { mutate, mutateAsync, isPending };
}

function changingLibrary<T, R>(action: (input: T) => Promise<R>): (input: T) => Promise<R> {
  return async (input) => {
    const result = await action(input);
    notifyLibraryChanged();
    return result;
  };
}

/** A playlist can be both created and saved by the user, so deleting it also drops the saved copy. */
async function removePlaylist(id: string, isOwned?: boolean) {
  evictPlaylistFromCache(id);
  if (isOwned === false) return api.removeCollection("playlists", id);
  try {
    const result = await api.deletePlaylist(id);
    await api.removeCollection("playlists", id).catch((error: unknown) => log("yellow", "library", `playlist ${id} was not saved`, error));
    return result;
  } catch (error) {
    if (isOwned === true) throw error;
    return api.removeCollection("playlists", id);
  }
}

async function removeCollection({ type, id, isOwned }: RemoveCollectionInput) {
  if (type === "playlist") return removePlaylist(id, isOwned);
  return api.removeCollection(`${type}s`, id);
}

async function deletePlaylist({ playlistId }: { playlistId: string }) {
  evictPlaylistFromCache(playlistId);
  return api.deletePlaylist(playlistId);
}

const addPlaylistTrack = changingLibrary(({ playlistId, trackId }: PlaylistTrackInput) => api.addPlaylistTrack(playlistId, trackId));
const removePlaylistItem = changingLibrary(({ playlistId, itemId }: PlaylistItemInput) => api.removePlaylistItem(playlistId, itemId));
const movePlaylistItem = changingLibrary(({ playlistId, itemId, beforeItemId, revision }: ReorderInput) =>
  api.movePlaylistItem(playlistId, itemId, { beforeItemId, revision }),
);
const createPlaylist = changingLibrary((input: { title: string; description?: string }) => api.createPlaylist(input));
const saveCollection = changingLibrary(({ type, id }: CollectionInput) => api.saveCollection(`${type}s`, id));
const removeSavedCollection = changingLibrary(removeCollection);
const removeOwnPlaylist = changingLibrary(deletePlaylist);

async function setTrackLiked(trackId: string, isLiked: boolean) {
  const rollback = applyOptimisticLike(trackId, isLiked);
  try {
    const result = await (isLiked ? api.likeTrack(trackId) : api.unlikeTrack(trackId));
    notifyLibraryChanged();
    return result;
  } catch (error) {
    rollback();
    throw error;
  }
}

/** Likes a track with an optimistic update that rolls back if the request fails. */
export function likeTrack(trackId: string) {
  return setTrackLiked(trackId, true);
}

export function unlikeTrack(trackId: string) {
  return setTrackLiked(trackId, false);
}

const togglingLikes = new Set<string>();

/** Taps while the previous toggle is still in flight are dropped, so a double tap cannot like and unlike at once. */
export async function toggleTrackLike(trackId: string): Promise<void> {
  if (togglingLikes.has(trackId)) return;
  togglingLikes.add(trackId);
  try {
    await setTrackLiked(trackId, !isTrackLiked(trackId));
  } catch (error) {
    log("yellow", "library", `toggling like for ${trackId} failed`, error);
  } finally {
    togglingLikes.delete(trackId);
  }
}

export const useAddPlaylistTracks = () => useMutation(addPlaylistTrack);
export const useRemovePlaylistTracks = () => useMutation(removePlaylistItem);
export const useReorderPlaylistTracks = () => useMutation(movePlaylistItem);
export const useCreatePlaylist = () => useMutation(createPlaylist);
export const useDeletePlaylist = () => useMutation(removeOwnPlaylist);
export const useSaveExternalItem = () => useMutation(saveCollection);
export const useRemoveExternalItem = () => useMutation(removeSavedCollection);
export const useLikeTrack = () => useMutation(likeTrack);
export const useUnlikeTrack = () => useMutation(unlikeTrack);
