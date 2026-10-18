import type { ArtistRef } from "./catalog";

export type LyricsFormat = "plain" | "lrc" | "ttml" | "qrc" | "richsync";

export type LyricsContentKind = "plain" | "line_synced" | "word_synced" | "syllable_synced";

export type LyricsSyncLevel = "plain" | "line_level" | "word_level" | "syllable_level";

export interface LyricsQuality {
  total: number;
  match: number;
  content: number;
  sync: number;
  source: number;
  reasons: string[];
}

export interface LyricsCandidate {
  provider: string;
  lyrics: { format: LyricsFormat; content: string };
  contentKind: LyricsContentKind;
  syncLevel: LyricsSyncLevel;
  quality: LyricsQuality;
  matchedTrack?: { title?: string; artists?: string[]; durationMs?: number };
}

interface ProviderEvent {
  type: "provider";
  provider: string;
  durationMs: number;
}

export type LyricsStreamEvent =
  | { type: "metadata"; track: { id: string; title: string; artists: ArtistRef[]; durationMs: number } }
  | (ProviderEvent & { status: "found"; syncLevel: LyricsSyncLevel; candidate: LyricsCandidate })
  | (ProviderEvent & { status: "not_found" })
  | (ProviderEvent & { status: "error"; message: string })
  | {
      type: "done";
      cached: boolean;
      best?: { provider: string; quality: number; syncLevel: LyricsSyncLevel };
      status?: "not_found";
    };
