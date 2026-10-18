import { mediaUrl, toClientTrack, type UserPlaylistItem, type PlaylistContents } from "@/shared/api";
import type { Track } from "@/shared/types";
import { log } from "@/shared/utils/logger";

export interface LibraryPlaylistDetail {
  id: string;
  title: string;
  description?: string;
  trackCount: number;
  coverUrl: string;
  coverUrls: string[];
  revision: number;
  tracks: Track[];
}

export interface CoverEntry {
  coverUrls: string[];
  trackCount: number;
  updatedAt: string;
}

export type CoverCache = Record<string, CoverEntry>;

const COVER_CACHE_KEY = "wave:playlist-covers-v2";
const MAX_COVERS = 4;

export function extractCovers(items: UserPlaylistItem[]): string[] {
  const covers = new Set<string>();
  for (const item of items) {
    if (covers.size === MAX_COVERS) break;
    const url = item.track.cover ? mediaUrl(item.track.cover.url) : "";
    if (url) covers.add(url);
  }
  return [...covers];
}

function toTrack(item: UserPlaylistItem): Track {
  return { ...toClientTrack(item.track), playlistItemId: item.id, addedAt: item.addedAt };
}

export function toDetail(response: PlaylistContents): LibraryPlaylistDetail {
  const covers = extractCovers(response.items);
  return {
    id: response.playlist.id,
    title: response.playlist.title,
    description: response.playlist.description,
    trackCount: response.items.length,
    coverUrl: covers[0] ?? "",
    coverUrls: covers,
    revision: response.playlist.revision,
    tracks: response.items.map(toTrack),
  };
}

export function toCoverEntry(detail: LibraryPlaylistDetail, updatedAt: string): CoverEntry {
  return { coverUrls: detail.coverUrls, trackCount: detail.trackCount, updatedAt };
}

/** @returns the saved covers, or an empty cache when none are saved or they are unreadable */
export function readCoverCache(): CoverCache {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(COVER_CACHE_KEY) ?? "{}") as CoverCache;
  } catch (error) {
    log("yellow", "library", "playlist cover cache is unreadable", error);
    return {};
  }
}

export function writeCoverCache(cache: CoverCache): void {
  try {
    localStorage.setItem(COVER_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    log("yellow", "library", "saving playlist covers failed", error);
  }
}

export function rememberCovers(id: string, entry: CoverEntry): void {
  writeCoverCache({ ...readCoverCache(), [id]: entry });
}
