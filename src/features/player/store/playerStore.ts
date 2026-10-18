import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Track } from "@/shared/types";
import { debouncedStorage } from "@/shared/utils/storage";
import { INITIAL_PLAYER_STATE } from "./playerDefaults";
import {
  mergePlayerSession,
  migratePlayerSession,
  persistedPlayerSession,
  PLAYER_SESSION_STORAGE_KEY,
  PLAYER_SESSION_VERSION,
} from "./playerPersistence";
import type { PlayerState, PlayerStore } from "./playerTypes";

export type * from "./playerTypes";
export { DEFAULT_VOLUME, INITIAL_PLAYER_STATE } from "./playerDefaults";

const NO_CONTEXT = { playbackContext: null, playbackContextCover: null, playbackContextTitle: null } as const;

function clearedQueue(currentTrack: Track | null): Partial<PlayerState> {
  if (currentTrack) return { ...NO_CONTEXT, queue: [currentTrack], currentIndex: 0 };
  return { ...NO_CONTEXT, queue: [], currentIndex: -1, currentTrack: null, fullscreen: false };
}

export const usePlayerStore = create<PlayerStore>()(
  persist(
    (set, get) => ({
      ...INITIAL_PLAYER_STATE,
      dispatch: () => {},
      setStatus: (status, error = null) => set({ status, error }),
      setPosition: (positionMs) => set({ positionMs }),
      setDuration: (durationMs) => set({ durationMs }),
      setPlaybackMode: (playbackMode) => set({ playbackMode }),
      setRepeat: (repeat) => set({ repeat }),
      setShuffle: (shuffle) => set({ shuffle }),
      setSmartShuffle: (smartShuffle) => set({ smartShuffle }),
      setVolume: (volume) => set({ volume }),
      setCurrentTrack: (currentTrack, currentIndex) => {
        const trackChanged = get().currentTrack?.id !== currentTrack?.id;
        set(trackChanged ? { currentTrack, currentIndex, positionMs: 0 } : { currentTrack, currentIndex });
      },
      setQueue: (queue) => set({ queue }),
      setPlaybackContext: (playbackContext) => set({ playbackContext }),
      setPlaybackContextCover: (playbackContextCover) => set({ playbackContextCover }),
      setPlaybackContextTitle: (playbackContextTitle) => set({ playbackContextTitle }),
      setAudioQuality: (audioQuality) => set({ audioQuality }),
      setMiniPlayerStyle: (miniPlayerStyle) => set({ miniPlayerStyle }),
      setAccentVariant: (accentVariant) => set({ accentVariant }),
      setPauseOnDeviceChange: (pauseOnDeviceChange) => set({ pauseOnDeviceChange }),
      setAutoplaySimilar: (autoplaySimilar) => set({ autoplaySimilar }),
      setNormalizeVolume: (normalizeVolume) => set({ normalizeVolume }),
      setCrossfadeSeconds: (crossfadeSeconds) => set({ crossfadeSeconds }),
      setTrackDoubleClickBehavior: (trackDoubleClickBehavior) => set({ trackDoubleClickBehavior }),
      setDefaultPlaybackContext: (defaultPlaybackContext) => set({ defaultPlaybackContext }),
      setFullscreen: (fullscreen) => {
        if (get().fullscreen !== fullscreen) set({ fullscreen });
      },
      clearQueue: () => set(clearedQueue(get().currentTrack)),
    }),
    {
      name: PLAYER_SESSION_STORAGE_KEY,
      storage: createJSONStorage(() => debouncedStorage),
      version: PLAYER_SESSION_VERSION,
      migrate: migratePlayerSession,
      merge: mergePlayerSession,
      partialize: persistedPlayerSession,
    },
  ),
);
