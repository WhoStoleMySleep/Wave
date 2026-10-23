import type {
  AlbumDetails,
  ArtistDetails,
  CatalogPlaylistDetails,
  CatalogTrack,
  Items,
  PopularTimeWindow,
  PopularTracksPage,
  SearchItem,
  SearchSource,
  SearchType,
  TrackMatch,
} from "../../contracts";
import { apiPath, withQuery } from "../apiPath";
import { request, requestNoContent } from "../client";

export interface RadioOptions {
  history?: string[];
  k?: number;
  drift_rate?: number;
  temperature?: number;
  wave_id?: string;
}

export const catalogEndpoints = {
  search(q: string, type: SearchType = "all", source: SearchSource = "youtube"): Promise<Items<SearchItem>> {
    return request<Items<SearchItem>>(withQuery("/v1/search", { q, type, source }));
  },

  getTrack(id: string): Promise<CatalogTrack> {
    return request<CatalogTrack>(apiPath`/v1/tracks/${id}`);
  },

  /** History is too long for a query string, so a request that carries it goes as a POST body. */
  getRadio(id: string, options: RadioOptions = {}): Promise<Items<CatalogTrack>> {
    const path = apiPath`/v1/tracks/${id}/radio`;
    if (options.history?.length) return request<Items<CatalogTrack>>(path, { method: "POST", body: options });
    const { k, drift_rate, temperature, wave_id } = options;
    return request<Items<CatalogTrack>>(withQuery(path, { k, drift_rate, temperature, wave_id }));
  },

  getAlbum(id: string): Promise<AlbumDetails> {
    return request<AlbumDetails>(apiPath`/v1/albums/${id}`);
  },

  getArtist(id: string): Promise<ArtistDetails> {
    return request<ArtistDetails>(apiPath`/v1/artists/${id}`);
  },

  getPlaylist(id: string): Promise<CatalogPlaylistDetails> {
    return request<CatalogPlaylistDetails>(apiPath`/v1/playlists/${id}`);
  },

  getTrackMatch(id: string): Promise<TrackMatch> {
    return request<TrackMatch>(apiPath`/v1/tracks/${id}/match`);
  },

  /** The chosen track plays for everyone on the server from then on. */
  setTrackMatch(id: string, youtubeId: string): Promise<void> {
    return requestNoContent(apiPath`/v1/tracks/${id}/match`, { method: "PUT", body: { youtubeId } });
  },

  getPopularTracks(window: PopularTimeWindow = "7d", limit = 50): Promise<PopularTracksPage> {
    return request<PopularTracksPage>(withQuery("/v1/explore/popular", { window, limit }));
  },
};
