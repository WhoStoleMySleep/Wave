import type { Track } from "../types";
import { mediaUrl } from "./media";

type ArtistRef = { id?: string; name?: string } | null | undefined;
type ArtistSource = string | ArtistRef;

export interface TrackSource {
  id: string;
  title: string;
  artists?: string | ArtistSource[];
  artistList?: ArtistSource[];
  artist?: string | ArtistRef;
  artistId?: string;
  artist_id?: string;
  cover?: string | { url?: string } | null;
  coverUrl?: string;
  cover_url?: string;
  durationMs?: number;
  duration_ms?: number;
  playCount?: number;
  explicit?: boolean;
  album?: { id?: string | number; title?: string } | null;
}

interface ClientArtist {
  id: string;
  name: string;
}

const EMPTY_TRACK: Track = { id: "", title: "", artists: "", coverUrl: "", durationMs: 0, playCount: 0 };
const UNKNOWN_ARTIST_ID = "unknown";

function toArtist(source: ArtistSource): ClientArtist {
  if (typeof source === "string") return { id: "", name: source };
  return { id: source?.id ?? "", name: source?.name ?? "" };
}

function listed(artists: ArtistSource[] | string | undefined): ClientArtist[] {
  return Array.isArray(artists) ? artists.map(toArtist) : [];
}

function fromNames(names: string, firstId: string): ClientArtist[] {
  const parts = names.split(",").map((name) => name.trim()).filter(Boolean);
  return parts.map((name, index) => ({ id: index === 0 ? firstId : "", name }));
}

function artistsOf(source: TrackSource): ClientArtist[] {
  const firstId = source.artistId || source.artist_id || "";
  const fromList = listed(source.artistList);
  if (fromList.length > 0) return fromList;
  const fromArray = listed(source.artists);
  if (fromArray.length > 0) return fromArray;
  if (source.artist && typeof source.artist === "object") return [toArtist(source.artist)];
  if (typeof source.artists === "string" && source.artists.trim()) return fromNames(source.artists, firstId);
  if (typeof source.artist === "string" && source.artist.trim()) return [{ id: firstId, name: source.artist.trim() }];
  return [];
}

function artistLine(source: TrackSource, artists: ClientArtist[]): string {
  if (typeof source.artists === "string") return source.artists;
  if (typeof source.artist === "string") return source.artist;
  return artists.map((artist) => artist.name).filter(Boolean).join(", ");
}

function isKnownId(id: string | undefined): id is string {
  return Boolean(id) && id !== UNKNOWN_ARTIST_ID;
}

function primaryArtistId(source: TrackSource, artists: ClientArtist[]): string | undefined {
  return [...artists.map((artist) => artist.id), source.artistId, source.artist_id].find(isKnownId);
}

function coverOf(source: TrackSource): string {
  const coverPath = typeof source.cover === "string" ? source.cover : source.cover?.url;
  if (coverPath) return mediaUrl(coverPath);
  return source.coverUrl ?? source.cover_url ?? "";
}

function albumOf(source: TrackSource): Track["album"] {
  const id = source.album?.id ? String(source.album.id) : "";
  const title = source.album?.title ? String(source.album.title) : "";
  return id || title ? { id, title } : undefined;
}

export function toClientTrack(source: TrackSource | null | undefined): Track {
  if (!source) return { ...EMPTY_TRACK };
  const artists = artistsOf(source);
  return {
    id: source.id,
    title: source.title,
    artists: artistLine(source, artists),
    artistList: artists.length > 0 ? artists : undefined,
    artistId: primaryArtistId(source, artists),
    coverUrl: coverOf(source),
    durationMs: source.durationMs ?? source.duration_ms ?? 0,
    playCount: source.playCount ?? 0,
    explicit: source.explicit,
    album: albumOf(source),
  };
}
