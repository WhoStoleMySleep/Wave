export interface PlaybackSession {
  sessionId: string;
  playbackId: string;
  trackId: string;
  streamUrl: string;
  codec: "opus" | "aac";
  bitrate: number;
  mimeType: string;
  expiresAt: string;
  transport: "proxy";
  loudnessDb?: number | null;
}

export interface PlaybackContext {
  type: string;
  id?: string;
}

export interface PlaybackEvent {
  playbackSessionId: string;
  listeningSessionId: string;
  trackId: string;
  playedDurationMs: number;
  trackDurationMs?: number;
  completionRate: number;
  completed?: boolean;
  skipped?: boolean;
  loopCount?: number;
  hasSeekBackward?: boolean;
  context?: PlaybackContext;
  /** When the listen ended; a listen sent late keeps its time in the history. */
  listenedAt?: string;
}
