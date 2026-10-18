import { useSyncExternalStore } from "react";
import { isTrackLiked, subscribeLikedTracks } from "./useLikedTracks";

/** Re-renders only when this track's like state flips, not on every change to the liked list. */
export function useIsTrackLiked(trackId: string | undefined): boolean {
  return useSyncExternalStore(
    subscribeLikedTracks,
    () => (trackId ? isTrackLiked(trackId) : false),
    () => false,
  );
}
