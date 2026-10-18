import type { CatalogTrack } from "./catalog";

export interface PlaylistOwner {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface UserPlaylist {
  id: string;
  title: string;
  description?: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  revision: number;
  ownerId: string;
  owner: PlaylistOwner;
}

export interface UserPlaylistItem {
  id: string;
  track: CatalogTrack;
  position: number;
  addedAt: string;
}

export interface PlaylistContents {
  playlist: UserPlaylist;
  items: UserPlaylistItem[];
}
