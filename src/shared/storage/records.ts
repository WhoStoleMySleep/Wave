import type { Track } from "@/shared/types";
import type { LyricsCandidate, LyricsSyncLevel } from "@/shared/contracts/lyrics";
import type { LyricsProviderOption } from "@/features/lyrics/lib/candidateRanking";

export interface CachedTrackRecord {
  id: string;
  title: string;
  artists: string;
  albumTitle?: string;
  albumId?: string;
  coverUrl?: string;
  durationMs: number;
  savedAt: number;
}

export interface CachedAudioRecord {
  trackId: string;
  blob: Blob;
  mimeType: string;
  byteSize: number;
  savedAt: number;
  lastPlayedAt?: number;
  loudnessDb?: number;
}

export interface AudioPlayRecord {
  trackId: string;
  lastPlayedAt: number;
}

export interface CachedLyricsRecord {
  trackId: string;
  syncLevel: LyricsSyncLevel;
  quality: number;
  activeProvider: string;
  availableProviders: LyricsProviderOption[];
  rawLyrics: string;
  rawFormat: string;
  candidate: LyricsCandidate;
  providers?: Record<string, LyricsCandidate>;
  lastCheckedAt: number;
  updatedAt: number;
  userLocked?: boolean;
}

export interface DownloadRecord {
  trackId: string;
  track: Track;
  downloadedAt: number;
}

export interface CachedArtistRecord {
  id: string;
  data: unknown;
  savedAt: number;
  lastCheckedAt: number;
}

export interface SnapshotRecord<T = unknown> {
  key: string;
  data: T;
  savedAt: number;
}

export interface CoverRecord {
  url: string;
  blob: Blob;
  savedAt: number;
}
