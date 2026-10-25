import { isAccentVariant } from "./accentVariants";
import { DEFAULT_VOLUME } from "./playerDefaults";
import type { PlayerState, PlayerStore } from "./playerTypes";

export const PLAYER_SESSION_STORAGE_KEY = "wave_player_session_v2";
export const PLAYER_SESSION_VERSION = 1;

const RESUME_KEYS = [
  "queue",
  "currentIndex",
  "currentTrack",
  "playbackContext",
  "playbackContextCover",
  "playbackContextTitle",
  "playbackMode",
  "positionMs",
  "durationMs",
] as const satisfies readonly (keyof PlayerState)[];

const PREFERENCE_KEYS = [
  "repeat",
  "shuffle",
  "smartShuffle",
  "volume",
  "audioQuality",
  "miniPlayerStyle",
  "accentVariant",
  "pauseOnDeviceChange",
  "autoplaySimilar",
  "normalizeVolume",
  "duckOthers",
  "duckVolume",
  "crossfadeSeconds",
  "trackDoubleClickBehavior",
  "defaultPlaybackContext",
] as const satisfies readonly (keyof PlayerState)[];

type PersistedKey = (typeof RESUME_KEYS)[number] | (typeof PREFERENCE_KEYS)[number];
export type PersistedPlayerSession = Partial<Pick<PlayerState, PersistedKey>>;

function pick<K extends keyof PlayerState>(state: PlayerState, keys: readonly K[]): Pick<PlayerState, K> {
  return Object.fromEntries(keys.map((key) => [key, state[key]])) as Pick<PlayerState, K>;
}

export function persistedPlayerSession(state: PlayerState): PersistedPlayerSession {
  const preferences = pick(state, PREFERENCE_KEYS);
  if (state.defaultPlaybackContext !== "resume") return preferences;
  return { ...pick(state, RESUME_KEYS), ...preferences };
}

/** Sessions saved before version 1 kept full volume only because it was the old default; any other level was chosen. */
export function migratePlayerSession(persisted: unknown, version: number): PersistedPlayerSession {
  const session = (persisted ?? {}) as PersistedPlayerSession;
  if (version >= 1 || session.volume !== 1) return session;
  return { ...session, volume: DEFAULT_VOLUME };
}

/** A saved track comes back paused so the player shows it without starting playback on launch. */
export function mergePlayerSession(persisted: unknown, current: PlayerStore): PlayerStore {
  const merged = { ...current, ...(persisted as PersistedPlayerSession | undefined) };
  return {
    ...merged,
    status: merged.currentTrack ? "paused" : merged.status,
    accentVariant: isAccentVariant(merged.accentVariant) ? merged.accentVariant : "default",
  };
}
