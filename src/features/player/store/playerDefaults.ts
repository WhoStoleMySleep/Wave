import { toVolumeGain } from "../engine/volume";
import type { PlayerState } from "./playerTypes";

export const DEFAULT_VOLUME = toVolumeGain(0.75);

export const INITIAL_PLAYER_STATE: PlayerState = {
  status: "idle",
  playbackMode: null,
  error: null,
  positionMs: 0,
  durationMs: 0,
  queue: [],
  currentIndex: -1,
  currentTrack: null,
  playbackContext: null,
  playbackContextCover: null,
  playbackContextTitle: null,
  volume: DEFAULT_VOLUME,
  repeat: "off",
  shuffle: false,
  smartShuffle: false,
  audioQuality: "high",
  miniPlayerStyle: "default",
  accentVariant: "default",
  pauseOnDeviceChange: true,
  autoplaySimilar: true,
  normalizeVolume: true,
  duckOthers: false,
  duckVolume: 0.2,
  crossfadeSeconds: 0,
  trackDoubleClickBehavior: "play",
  defaultPlaybackContext: "resume",
  fullscreen: false,
};
