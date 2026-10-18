import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { OverlayPosition, OverlaySettings } from "../contracts";
import { normalizeShortcutToEnglish } from "../lib/shortcutUtils";

interface OverlaySettingsState extends OverlaySettings {
  setEnabled: (enabled: boolean) => void;
  setPosition: (position: OverlayPosition) => void;
  setShortcut: (shortcut: string) => void;
  setAutoShowOnMinimize: (autoShowOnMinimize: boolean) => void;
  setAlwaysOnTop: (alwaysOnTop: boolean) => void;
}

const DEFAULT_SETTINGS: OverlaySettings = {
  enabled: true,
  position: "top-center",
  shortcut: "Alt+Shift+O",
  autoShowOnMinimize: true,
  alwaysOnTop: true,
};

function notifyNative(patch: Partial<OverlaySettings>) {
  if (typeof window !== "undefined" && window.waveNative?.updateOverlaySettings) {
    window.waveNative.updateOverlaySettings(patch);
  }
}

export const useOverlaySettingsStore = create<OverlaySettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      setEnabled: (enabled) => {
        set({ enabled });
        notifyNative({ enabled });
      },
      setPosition: (position) => {
        set({ position });
        notifyNative({ position });
      },
      setShortcut: (rawShortcut) => {
        const shortcut = normalizeShortcutToEnglish(rawShortcut) || DEFAULT_SETTINGS.shortcut;
        set({ shortcut });
        notifyNative({ shortcut });
      },
      setAutoShowOnMinimize: (autoShowOnMinimize) => {
        set({ autoShowOnMinimize });
        notifyNative({ autoShowOnMinimize });
      },
      setAlwaysOnTop: (alwaysOnTop) => {
        set({ alwaysOnTop });
        notifyNative({ alwaysOnTop });
      },
    }),
    {
      name: "wave_overlay_settings_v1",
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state?.shortcut) {
          state.shortcut = normalizeShortcutToEnglish(state.shortcut) || DEFAULT_SETTINGS.shortcut;
        }
      },
    }
  )
);
