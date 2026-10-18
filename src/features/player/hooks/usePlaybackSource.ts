import { useMemo } from "react";
import { usePlayerStore } from "../store/playerStore";
import { usePlaylistsList } from "@/features/library/hooks";
import { useTranslation } from "@/languages";

/** Prefixes of context ids; anything else is a bare title, which may itself contain a colon. */
const CONTEXT_KINDS = new Set(["playlist", "album", "artist", "radio"]);

export interface PlaybackSource {
  /** What the header above the fullscreen player says, or null when nothing is playing from anywhere. */
  label: string | null;
  /** The user's own playlist that is playing, the one the player's add button saves into. */
  ownPlaylistId: string | null;
  /** The current track came in after the context ran out or as a smart-shuffle pick. */
  addedBy: "wave" | "smart" | null;
}

/** Names where the current queue comes from and which own playlist, if any, it plays. */
export function usePlaybackSource(): PlaybackSource {
  const { t } = useTranslation();
  const context = usePlayerStore((state) => state.playbackContext);
  const title = usePlayerStore((state) => state.playbackContextTitle);
  const addedBy = usePlayerStore((state) => state.currentTrack?.queueSource ?? null);
  const { data } = usePlaylistsList();

  return useMemo(() => {
    const separator = context?.indexOf(":") ?? -1;
    const prefix = separator > 0 ? context!.slice(0, separator) : "";
    const kind = CONTEXT_KINDS.has(prefix) ? prefix : null;
    const id = kind ? context!.slice(separator + 1) : "";
    const ownPlaylist =
      kind === "playlist" ? data.playlists.find((playlist) => playlist.id === id) : undefined;

    let label: string | null;
    if (!context) label = null;
    else if (kind === "radio") label = title ? t("player.wave_by_track", { title }) : t("player.wave");
    else if (context === "playlist:likes") label = t("library.liked_songs");
    else if (context === "playlist:downloads") label = t("downloads.title");
    else if (ownPlaylist) label = ownPlaylist.title;
    else if (kind) label = title;
    else label = context;

    return { label, ownPlaylistId: ownPlaylist?.id ?? null, addedBy };
  }, [context, title, addedBy, data.playlists, t]);
}
