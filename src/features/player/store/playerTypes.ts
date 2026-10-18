import type { Track } from "@/shared/types";
import type { AccentVariant } from "./accentVariants";

export type { AccentVariant } from "./accentVariants";

export type RepeatMode = "off" | "all" | "one";
export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";
export type MiniPlayerStyle = "default" | "rounded";
export type AudioQuality = "low" | "standard" | "high" | "lossless";
export type TrackDoubleClickBehavior = "play" | "queue";
export type DefaultPlaybackContext = "resume" | "empty";

export type PlaybackContextInput =
  | string
  | null
  | { id: string | null; title?: string | null };

export interface TransportState {
  status: PlayerStatus;
  playbackMode: "hls" | "mp3" | null;
  error: string | null;
}

export interface TimelineState {
  positionMs: number;
  durationMs: number;
}

export interface QueueState {
  queue: Track[];
  currentIndex: number;
  currentTrack: Track | null;
  playbackContext: string | null;
  playbackContextCover: string | null;
  playbackContextTitle: string | null;
}

export interface SessionState {
  volume: number;
  repeat: RepeatMode;
  shuffle: boolean;
  smartShuffle: boolean;
  audioQuality: AudioQuality;
  miniPlayerStyle: MiniPlayerStyle;
  accentVariant: AccentVariant;
  pauseOnDeviceChange: boolean;
  autoplaySimilar: boolean;
  normalizeVolume: boolean;
  crossfadeSeconds: number;
  trackDoubleClickBehavior: TrackDoubleClickBehavior;
  defaultPlaybackContext: DefaultPlaybackContext;
  fullscreen: boolean;
}

export type PlayerState = TransportState &
  TimelineState &
  QueueState &
  SessionState;

export type PlayerCommand =
  | {
      type: "PLAY_REQUESTED";
      track: Track;
      queue?: Track[];
      context?: PlaybackContextInput;
      contextCover?: string | null;
    }
  | { type: "PAUSE_REQUESTED" }
  | { type: "RESUME_REQUESTED" }
  | { type: "SEEK_COMMITTED"; positionMs: number }
  | { type: "SKIP_NEXT"; isAutoEnd?: boolean }
  | { type: "SKIP_PREVIOUS" }
  | { type: "SET_VOLUME"; volume: number }
  | { type: "TOGGLE_PLAY_PAUSE" };

export interface PlayerStore extends PlayerState {
  dispatch: (command: PlayerCommand) => void;
  setStatus: (status: PlayerStatus, error?: string | null) => void;
  setPosition: (positionMs: number) => void;
  setDuration: (durationMs: number) => void;
  setPlaybackMode: (mode: "hls" | "mp3" | null) => void;
  setRepeat: (mode: RepeatMode) => void;
  setShuffle: (shuffle: boolean) => void;
  setSmartShuffle: (smartShuffle: boolean) => void;
  setVolume: (volume: number) => void;
  setCurrentTrack: (track: Track | null, index: number) => void;
  setQueue: (queue: Track[]) => void;
  setPlaybackContext: (context: string | null) => void;
  setPlaybackContextCover: (cover: string | null) => void;
  setPlaybackContextTitle: (title: string | null) => void;
  setAudioQuality: (quality: AudioQuality) => void;
  setMiniPlayerStyle: (style: MiniPlayerStyle) => void;
  setAccentVariant: (variant: AccentVariant) => void;
  setPauseOnDeviceChange: (value: boolean) => void;
  setAutoplaySimilar: (value: boolean) => void;
  setNormalizeVolume: (value: boolean) => void;
  setCrossfadeSeconds: (value: number) => void;
  setTrackDoubleClickBehavior: (value: TrackDoubleClickBehavior) => void;
  setDefaultPlaybackContext: (value: DefaultPlaybackContext) => void;
  setFullscreen: (value: boolean) => void;
  clearQueue: () => void;
}
