import type { CatalogTrack } from "./catalog";
import type { PlaybackContext } from "./playback";

export interface ListeningHistoryItem {
  id: string;
  playbackSessionId: string;
  listeningSessionId: string;
  track: CatalogTrack;
  playedDurationMs: number;
  completionRate: number;
  completed: boolean;
  skipped: boolean;
  loopCount: number;
  hasSeekBackward: boolean;
  context?: PlaybackContext;
  listenedAt: string;
}

export interface ListeningHistoryPage {
  items: ListeningHistoryItem[];
  nextCursor: string | null;
}
