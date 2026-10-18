import type { CatalogTrack } from "./catalog";

export interface LikedTrack {
  track: CatalogTrack;
  likedAt: string;
}

export interface LikedTracksPage {
  items: LikedTrack[];
  nextCursor: string | null;
}

export interface TrackSaved {
  liked: boolean;
  playlists: { playlistId: string; itemId: string }[];
}
