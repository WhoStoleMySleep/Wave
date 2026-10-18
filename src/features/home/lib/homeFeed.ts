import { toClientTrack, type DailyMix as DailyMixSource, type ListeningHistoryItem, type PopularTrack } from "@/shared/api";
import type { Track } from "@/shared/types";

export interface PopularAlbumItem {
  id: string;
  title: string;
  artist: string;
  coverUrl: string;
  totalTracks: number;
  albumType: string;
  explicit?: boolean;
}

export interface PopularArtistItem {
  id: string;
  name: string;
  imageUrl: string;
  followers: number;
  description: string;
  totalListens: number;
  totalTracks: number;
}

export interface PopularPlaylistItem {
  id: string;
  title: string;
  owner: string;
  coverUrl: string;
  totalTracks: number;
}

export type PopularTrackItem = Track;

export type PopularItem =
  | { type: "track"; item: PopularTrackItem; playCount: number }
  | { type: "album"; item: PopularAlbumItem; playCount: number }
  | { type: "artist"; item: PopularArtistItem; playCount: number }
  | { type: "playlist"; item: PopularPlaylistItem; playCount: number };

export interface DailyMix {
  id: string;
  title: string;
  description: string;
  clusterArtists: string[];
  coverUrl?: string;
  trackCount: number;
  tracks: Track[];
}

const MIX_ARTIST_COUNT = 4;
const UNKNOWN_ARTIST = "unknown";
const SINGLE_PLAY = 1;

export function toPopularTracks(entries: readonly PopularTrack[]): PopularItem[] {
  return entries.map((entry) => ({ type: "track", item: toClientTrack(entry.track), playCount: entry.playCount }));
}

function leadArtist(track: Track): { id: string; name: string } | null {
  const name = track.artistList?.[0]?.name || track.artists?.split(",")[0]?.trim() || "";
  if (!name) return null;
  return { id: track.artistList?.[0]?.id || track.artistId || name, name };
}

function toArtistItem(track: Track, playCount: number, artist: { id: string; name: string }): PopularItem {
  const item = { ...artist, imageUrl: track.coverUrl, followers: playCount, description: "", totalListens: playCount, totalTracks: 1 };
  return { type: "artist", item, playCount };
}

/** The lead artist of each popular track, once, in the order of their best-ranked track. */
export function toPopularArtists(entries: readonly PopularTrack[]): PopularItem[] {
  const artists = new Map<string, PopularItem>();
  for (const entry of entries) {
    const track = toClientTrack(entry.track);
    const artist = leadArtist(track);
    if (artist && !artists.has(artist.name)) artists.set(artist.name, toArtistItem(track, entry.playCount, artist));
  }
  return [...artists.values()];
}

interface RecentEntry {
  keys: string[];
  item: PopularItem;
}

function albumEntry(entry: ListeningHistoryItem, albumId: string): RecentEntry {
  const track = toClientTrack(entry.track);
  const album = { id: albumId, title: entry.track.album?.title || track.title, artist: track.artists, coverUrl: track.coverUrl, totalTracks: 0, albumType: "album" };
  return { keys: [`album:${albumId}`, `track:${entry.track.id}`], item: { type: "album", item: album, playCount: SINGLE_PLAY } };
}

function recentEntry(entry: ListeningHistoryItem): RecentEntry | null {
  if (!entry.track?.id) return null;
  const albumId = entry.context?.type === "album" ? entry.context.id || entry.track.album?.id : undefined;
  if (albumId) return albumEntry(entry, albumId);
  return { keys: [`track:${entry.track.id}`], item: { type: "track", item: toClientTrack(entry.track), playCount: SINGLE_PLAY } };
}

/** Recent plays, newest first; tracks played from an album collapse into the album, shown once. */
export function toRecentItems(entries: readonly ListeningHistoryItem[], limit: number): PopularItem[] {
  const seen = new Set<string>();
  const items: PopularItem[] = [];
  for (const recent of entries.map(recentEntry)) {
    if (!recent || seen.has(recent.keys[0])) continue;
    recent.keys.forEach((key) => seen.add(key));
    items.push(recent.item);
    if (items.length >= limit) break;
  }
  return items;
}

function trackArtistNames(track: Track): string[] {
  if (track.artistList?.length) return track.artistList.map((artist) => artist.name);
  return (track.artists ?? "").split(",");
}

/** Names that describe a mix: its cluster artists first, then the tracks' artists, unique regardless of case. */
export function getDailyMixArtists(clusterArtists: readonly string[] = [], tracks: readonly Track[] = [], targetCount = MIX_ARTIST_COUNT): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of [...clusterArtists, ...tracks.flatMap(trackArtistNames)]) {
    const name = raw?.trim() ?? "";
    const key = name.toLowerCase();
    if (!name || key === UNKNOWN_ARTIST || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length >= targetCount) break;
  }
  return names;
}

export function toDailyMix(source: DailyMixSource): DailyMix {
  const tracks = (source.tracks ?? []).map((track) => toClientTrack(track));
  return {
    id: source.id,
    title: source.title,
    description: source.description,
    clusterArtists: getDailyMixArtists(source.clusterArtists, tracks),
    coverUrl: tracks[0]?.coverUrl || tracks[1]?.coverUrl,
    trackCount: source.trackCount || tracks.length,
    tracks,
  };
}
