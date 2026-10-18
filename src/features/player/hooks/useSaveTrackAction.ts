import { useCallback, useRef } from "react";
import {
  addTrackToPlaylist,
  likeTrack,
  useIsTrackLiked,
  useModalStore,
  usePlaylistsList,
  useTrackMemberships,
} from "@/features/library";
import { useToast } from "@/shared/ui";
import { useTranslation } from "@/languages";
import type { Track } from "@/shared/types";
import { usePlaybackSource } from "./usePlaybackSource";

/**
 * The player's save button, Spotify style. The first tap saves the track where
 * it belongs: into the own playlist that is playing (wave tracks after its end
 * and smart-shuffle picks included), otherwise into the likes. Once the track
 * is saved there, a tap opens the list of all places to keep or drop it.
 */
export function useSaveTrackAction(track: Track | null): { saved: boolean; press: () => void } {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { ownPlaylistId } = usePlaybackSource();
  const { data } = usePlaylistsList();
  const memberships = useTrackMemberships(track?.id);
  const isLiked = useIsTrackLiked(track?.id);
  const openAddToPlaylist = useModalStore((state) => state.openAddToPlaylist);
  const pendingRef = useRef(false);

  const saved = ownPlaylistId
    ? (memberships?.has(ownPlaylistId) ?? false)
    : isLiked || (memberships?.size ?? 0) > 0;

  const press = useCallback(() => {
    if (!track || pendingRef.current) return;
    if (saved) {
      openAddToPlaylist(
        {
          id: track.id,
          title: track.title,
          artists: track.artists,
          coverUrl: track.coverUrl,
          durationMs: track.durationMs,
        },
        "manage",
      );
      return;
    }
    pendingRef.current = true;
    const target = ownPlaylistId
      ? data.playlists.find((playlist) => playlist.id === ownPlaylistId)?.title
      : t("library.liked_songs");
    const save = ownPlaylistId ? addTrackToPlaylist(ownPlaylistId, track.id) : likeTrack(track.id);
    save
      .then(() => toast(t("player.saved_to", { title: target ?? "" }), "checkmark"))
      .catch(() => toast(t("common.failed_add_playlist"), "error"))
      .finally(() => {
        pendingRef.current = false;
      });
  }, [track, saved, ownPlaylistId, data.playlists, openAddToPlaylist, toast, t]);

  return { saved, press };
}
