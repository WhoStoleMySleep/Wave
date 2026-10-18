import type { PlaylistContents, UserPlaylist, UserPlaylistItem } from "../../contracts";
import { apiPath } from "../apiPath";
import { request, requestNoContent } from "../client";

export interface PlaylistDraft {
  title: string;
  description?: string;
  isPublic?: boolean;
}

export interface PlaylistChanges {
  title?: string;
  description?: string | null;
  isPublic?: boolean;
}

export interface PlaylistItemPlacement {
  beforeItemId: string | null;
  revision: number;
}

export const playlistEndpoints = {
  listPlaylists(): Promise<{ items: UserPlaylist[] }> {
    return request<{ items: UserPlaylist[] }>("/v1/me/playlists");
  },

  getUserPlaylist(id: string): Promise<PlaylistContents> {
    return request<PlaylistContents>(apiPath`/v1/me/playlists/${id}`);
  },

  createPlaylist(draft: PlaylistDraft): Promise<UserPlaylist> {
    return request<UserPlaylist>("/v1/me/playlists", { method: "POST", body: draft });
  },

  updatePlaylist(id: string, changes: PlaylistChanges): Promise<UserPlaylist> {
    return request<UserPlaylist>(apiPath`/v1/me/playlists/${id}`, { method: "PATCH", body: changes });
  },

  deletePlaylist(id: string): Promise<void> {
    return requestNoContent(apiPath`/v1/me/playlists/${id}`, { method: "DELETE" });
  },

  addPlaylistTrack(playlistId: string, trackId: string): Promise<UserPlaylistItem> {
    return request<UserPlaylistItem>(apiPath`/v1/me/playlists/${playlistId}/tracks/${trackId}`, { method: "POST" });
  },

  removePlaylistItem(playlistId: string, itemId: string): Promise<void> {
    return requestNoContent(apiPath`/v1/me/playlists/${playlistId}/items/${itemId}`, { method: "DELETE" });
  },

  movePlaylistItem(playlistId: string, itemId: string, placement: PlaylistItemPlacement): Promise<PlaylistContents> {
    const path = apiPath`/v1/me/playlists/${playlistId}/items/${itemId}/move`;
    return request<PlaylistContents>(path, { method: "POST", body: placement });
  },
};
