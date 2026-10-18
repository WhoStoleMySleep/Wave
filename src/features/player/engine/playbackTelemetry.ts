import { api, type PlaybackContext, type PlaybackEvent } from "@/shared/api";
import { log } from "@/shared/utils/logger";
import type { Track } from "@/shared/types";
import { createId, errorMessage } from "./engineUtils";
import { parsePlaybackContext } from "./playbackContext";

const LISTENING_SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_TICK_GAP_MS = 5000;
const MAX_PAUSE_GAP_MS = 10000;
const MIN_REPORTED_PLAY_MS = 3000;
const SKIP_THRESHOLD_MS = 30000;

interface TrackListen {
  trackId: string;
  playbackSessionId: string;
  trackDurationMs: number;
  playedMs: number;
  completed: boolean;
  loopCount: number;
  hasSeekBackward: boolean;
  context?: PlaybackContext;
}

export class PlaybackTelemetry {
  private listen: TrackListen | null = null;
  private lastTickAt: number | null = null;
  private listeningSessionId = "";
  private lastActivityAt = 0;

  /** Reports the previous track and starts measuring `track`. */
  startTrack(track: Track, context: string | null): void {
    this.flush();
    this.listen = {
      trackId: track.id,
      playbackSessionId: createId("ps"),
      trackDurationMs: track.durationMs ?? 0,
      playedMs: 0,
      completed: false,
      loopCount: 0,
      hasSeekBackward: false,
      context: parsePlaybackContext(context),
    };
    this.touchListeningSession();
  }

  onPlaying(): void {
    const now = Date.now();
    this.lastTickAt = now;
    this.lastActivityAt = now;
  }

  onPausedOrStopped(): void {
    this.lastActivityAt = Date.now();
    this.addPlayedSinceTick(MAX_PAUSE_GAP_MS);
    this.lastTickAt = null;
  }

  /** Counts the time since the previous tick while playing, ignoring gaps from sleep. */
  onTick(isPlaying: boolean): void {
    if (!this.listen) return;
    const now = Date.now();
    this.lastActivityAt = now;
    if (isPlaying) this.addPlayedSinceTick(MAX_TICK_GAP_MS);
    this.lastTickAt = isPlaying ? now : null;
  }

  recordSeekBackward(): void {
    this.lastActivityAt = Date.now();
    if (this.listen) this.listen.hasSeekBackward = true;
  }

  onTrackCompleted(isRepeatOne: boolean): void {
    if (!this.listen) return;
    this.onPausedOrStopped();
    this.listen.completed = true;
    if (isRepeatOne) this.listen.loopCount += 1;
  }

  /** Reports the current track unless it played under three seconds. */
  flush(): void {
    if (!this.listen) return;
    this.onPausedOrStopped();
    const listen = this.listen;
    this.listen = null;
    if (listen.playedMs < MIN_REPORTED_PLAY_MS && !listen.completed) return;
    this.send(this.toEvent(listen));
  }

  private addPlayedSinceTick(maxGapMs: number): void {
    if (!this.listen || this.lastTickAt === null) return;
    const gap = Date.now() - this.lastTickAt;
    if (gap > 0 && gap < maxGapMs) this.listen.playedMs += gap;
  }

  private touchListeningSession(): string {
    const now = Date.now();
    const expired = now - this.lastActivityAt > LISTENING_SESSION_TIMEOUT_MS;
    if (!this.listeningSessionId || expired) this.listeningSessionId = createId("ls");
    this.lastActivityAt = now;
    return this.listeningSessionId;
  }

  private toEvent(listen: TrackListen): PlaybackEvent {
    const { trackDurationMs, playedMs, completed } = listen;
    return {
      playbackSessionId: listen.playbackSessionId,
      listeningSessionId: this.touchListeningSession(),
      trackId: listen.trackId,
      playedDurationMs: Math.round(playedMs),
      trackDurationMs: trackDurationMs > 0 ? trackDurationMs : undefined,
      completionRate: completionRate(listen),
      completed,
      skipped: !completed && playedMs < SKIP_THRESHOLD_MS,
      loopCount: listen.loopCount,
      hasSeekBackward: listen.hasSeekBackward,
      context: listen.context,
    };
  }

  private send(event: PlaybackEvent): void {
    api.recordPlaybackEvent(event).catch((error) => {
      log("yellow", "telemetry", `playback event report failed: ${errorMessage(error)}`);
    });
  }
}

function completionRate({ trackDurationMs, playedMs, completed }: TrackListen): number {
  const durationMs = trackDurationMs > 0 ? trackDurationMs : playedMs;
  const rate = durationMs > 0 ? playedMs / durationMs : Number(completed);
  return Number(Math.min(1, Math.max(0, rate)).toFixed(4));
}
