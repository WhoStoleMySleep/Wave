import { mediaUrl, toClientTrack, toMaxQualityAvatarUrl, type ArtistDetails, type ArtistRelease } from "@/shared/api";
import type { Track } from "@/shared/types";

export interface ArtistAlbumViewModel {
  id: string;
  title: string;
  coverUrl: string;
  releaseDate?: string;
  totalTracks?: number;
  explicit?: boolean;
}

export interface ArtistReleaseViewModel extends ArtistAlbumViewModel {
  releaseType: "single" | "ep";
}

export interface ArtistPageData {
  title: string;
  description: string;
  coverUrl: string;
  geniusImageUrl?: string;
  geniusAka?: string[];
  geniusUsername?: string;
  monthlyListeners?: string;
  verified: boolean;
  followers?: number;
  tracks: Track[];
  albums: ArtistAlbumViewModel[];
  singles: ArtistReleaseViewModel[];
}

function toAlbum(release: ArtistRelease): ArtistAlbumViewModel {
  return {
    id: release.id,
    title: release.title,
    coverUrl: release.cover ? mediaUrl(release.cover.url) : "",
    ...(release.year ? { releaseDate: String(release.year) } : {}),
  };
}

function toSingle(release: ArtistRelease): ArtistReleaseViewModel {
  return { ...toAlbum(release), releaseType: release.releaseType ?? "single" };
}

export function toArtistPage(artist: ArtistDetails): ArtistPageData {
  return {
    title: artist.name,
    verified: Boolean(artist.verified),
    description: artist.bio?.trim() || "",
    coverUrl: artist.cover ? toMaxQualityAvatarUrl(mediaUrl(artist.cover.url)) : "",
    tracks: artist.tracks.map((track) => toClientTrack(track)),
    albums: artist.albums.map(toAlbum),
    singles: artist.singles.map(toSingle),
  };
}
