export interface Cover {
  url: string;
  width: number;
  height: number;
}

export interface ArtistRef {
  id: string;
  name: string;
}

export interface AlbumRef {
  id: string;
  title: string;
}

export interface CatalogTrack {
  id: string;
  title: string;
  artists: ArtistRef[];
  album?: AlbumRef;
  durationMs: number;
  cover?: Cover;
}

export interface Items<T> {
  items: T[];
}

export type SearchType = "all" | "track" | "artist" | "album" | "playlist";

/** Where search looks; a track from another catalog plays as the YouTube track matched to it. */
export type SearchSource = "youtube" | "deezer" | "yandex" | "spotify";

export type TrackMatchStatus = "auto" | "doubtful" | "missing" | "manual" | "none";

/** The YouTube track a catalog track plays as, with the other candidates to choose from. */
export interface TrackMatch {
  status: TrackMatchStatus;
  youtubeId?: string;
  candidates: CatalogTrack[];
}

export type SearchTrack = CatalogTrack & { type: "track" };

export interface SearchArtist {
  type: "artist";
  id: string;
  name: string;
  cover?: Cover;
}

export interface SearchAlbum {
  type: "album";
  id: string;
  title: string;
  artists: ArtistRef[];
  year?: number;
  cover?: Cover;
}

export interface SearchPlaylist {
  type: "playlist";
  id: string;
  title: string;
  author?: string;
  cover?: Cover;
}

export type SearchItem = SearchTrack | SearchArtist | SearchAlbum | SearchPlaylist;

export interface AlbumDetails {
  type: "album";
  id: string;
  title: string;
  artists: ArtistRef[];
  year?: number;
  cover?: Cover;
  trackCount: number;
  durationMs: number;
  tracks: CatalogTrack[];
}

export interface CatalogPlaylistDetails {
  type: "playlist";
  id: string;
  title: string;
  author?: string;
  description?: string;
  cover?: Cover;
  trackCount: number;
  durationMs: number;
  tracks: CatalogTrack[];
}

export interface ArtistRelease {
  id: string;
  title: string;
  year?: number;
  cover?: Cover;
  releaseType?: "single" | "ep";
}

export interface ArtistDetails {
  type: "artist";
  id: string;
  name: string;
  bio?: string;
  cover?: Cover;
  verified: boolean;
  tracks: CatalogTrack[];
  albums: ArtistRelease[];
  singles: ArtistRelease[];
}
