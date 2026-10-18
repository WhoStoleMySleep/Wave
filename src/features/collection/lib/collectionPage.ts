import { mediaUrl, toClientTrack, type AlbumDetails, type CatalogPlaylistDetails, type CatalogTrack, type PlaylistContents } from "@/shared/api";
import type { Track } from "@/shared/types";
import type { DailyMix } from "@/features/home/lib/homeFeed";
import { extractCovers } from "@/features/library/lib/playlistDetail";

export interface CollectionPageData {
  type?: "playlist" | "album";
  title: string;
  author?: string;
  artists?: { id: string; name: string }[];
  description?: string;
  year?: number;
  coverUrl: string;
  tracks: Track[];
  isDailyMix?: boolean;
}

const DAILY_MIX_PREFIXES = ["daily-mix", "mix-"];
const FALLBACK_MIX_AUTHOR = "Daily Mix";
const PLACEHOLDER_COVER_HOST = "i.ytimg.com";

export function collectionKey(type: string, id: string): string {
  return `collection:${type}:${id}`;
}

export function isDailyMixId(ids: string[]): boolean {
  return ids.some((id) => DAILY_MIX_PREFIXES.some((prefix) => id.startsWith(prefix)));
}

export function isPlaylistContents(value: CatalogPlaylistDetails | PlaylistContents): value is PlaylistContents {
  return "playlist" in value && Array.isArray(value.items);
}

function clientTracks(tracks: CatalogTrack[]): Track[] {
  return tracks.map((track) => toClientTrack(track));
}

export function dailyMixPage(mix: DailyMix): CollectionPageData {
  return {
    type: "playlist",
    title: mix.title,
    author: mix.clusterArtists.length > 0 ? mix.clusterArtists.join(", ") : FALLBACK_MIX_AUTHOR,
    description: mix.description,
    coverUrl: mix.coverUrl || "",
    tracks: mix.tracks,
    isDailyMix: true,
  };
}

export function userPlaylistPage({ playlist, items }: PlaylistContents): CollectionPageData {
  return {
    type: "playlist",
    title: playlist.title,
    author: playlist.owner?.displayName || playlist.owner?.username || undefined,
    description: playlist.description || undefined,
    coverUrl: extractCovers(items)[0] ?? "",
    tracks: clientTracks(items.map((item) => item.track)),
  };
}

export function catalogPlaylistPage(playlist: CatalogPlaylistDetails): CollectionPageData {
  return {
    type: "playlist",
    title: playlist.title,
    author: playlist.author,
    description: playlist.description,
    coverUrl: playlist.cover ? mediaUrl(playlist.cover.url) : "",
    tracks: clientTracks(playlist.tracks),
  };
}

/** Album tracks often come without their album or with a video thumbnail, so the album fills both in. */
function withAlbum(track: Track, album: { id: string; title: string }, coverUrl: string): Track {
  const needsCover = Boolean(coverUrl) && (!track.coverUrl || track.coverUrl.includes(PLACEHOLDER_COVER_HOST));
  return { ...track, album: track.album?.id ? track.album : album, coverUrl: needsCover ? coverUrl : track.coverUrl };
}

export function albumPage(album: AlbumDetails, id: string): CollectionPageData {
  const coverUrl = album.cover ? mediaUrl(album.cover.url) : "";
  const ref = { id, title: album.title };
  return {
    type: "album",
    title: album.title,
    artists: album.artists,
    year: album.year,
    coverUrl,
    tracks: clientTracks(album.tracks).map((track) => withAlbum(track, ref, coverUrl)),
  };
}
