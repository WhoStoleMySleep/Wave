import type { LikedTracksPage, TrackSaved } from "../../contracts";
import { apiPath, withQuery } from "../apiPath";
import { request, requestNoContent } from "../client";

export type SavedCollectionKind = "albums" | "artists" | "playlists";

export const libraryEndpoints = {
  listLikedTracks(limit = 100, cursor?: string): Promise<LikedTracksPage> {
    return request<LikedTracksPage>(withQuery("/v1/me/library/tracks", { limit, cursor }));
  },

  likeTrack(id: string): Promise<void> {
    return requestNoContent(apiPath`/v1/me/library/tracks/${id}`, { method: "PUT" });
  },

  unlikeTrack(id: string): Promise<void> {
    return requestNoContent(apiPath`/v1/me/library/tracks/${id}`, { method: "DELETE" });
  },

  getTrackSaved(trackId: string): Promise<TrackSaved> {
    return request<TrackSaved>(apiPath`/v1/me/tracks/${trackId}/saved`);
  },

  listSavedCollections(kind: SavedCollectionKind): Promise<{ items: unknown[] }> {
    return request<{ items: unknown[] }>(apiPath`/v1/me/library/${kind}`);
  },

  saveCollection(kind: SavedCollectionKind, id: string): Promise<void> {
    return requestNoContent(apiPath`/v1/me/library/${kind}/${id}`, { method: "PUT" });
  },

  removeCollection(kind: SavedCollectionKind, id: string): Promise<void> {
    return requestNoContent(apiPath`/v1/me/library/${kind}/${id}`, { method: "DELETE" });
  },
};
