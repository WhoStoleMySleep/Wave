import { create } from "zustand";
import type { UpdateInfo, UpdateDownloadProgress } from "@/platform/native";
import { log } from "@/shared/utils/logger";

export type UpdaterStatus = "idle" | "checking" | "available" | "downloading" | "downloaded" | "error";

export interface UpdaterState {
  status: UpdaterStatus;
  updateInfo: UpdateInfo | null;
  isDialogOpen: boolean;
  downloadProgress: UpdateDownloadProgress | null;
  error: string | null;
  dismissedVersion: string | null;
  checkForUpdates: () => Promise<void>;
  skipUpdate: () => void;
  openDialog: () => void;
  startDownload: () => Promise<void>;
  installUpdate: () => Promise<void>;
  reset: () => void;
  initUpdaterListeners: () => () => void;
}

const IDLE = { status: "idle", updateInfo: null, isDialogOpen: false, downloadProgress: null, error: null } as const;

function failure(error: unknown, fallback: string): Pick<UpdaterState, "status" | "error"> {
  log("yellow", "updater", fallback, error);
  return { status: "error", error: error instanceof Error && error.message ? error.message : fallback };
}

export const useUpdaterStore = create<UpdaterState>((set, get) => {
  /** A version the user skipped stays available but no longer opens the dialog by itself. */
  const offer = (info: UpdateInfo) =>
    set({ status: "available", updateInfo: info, isDialogOpen: get().dismissedVersion !== info.version, error: null });

  return {
    ...IDLE,
    dismissedVersion: null,

    checkForUpdates: async () => {
      const native = window.waveNative;
      if (!native?.checkForUpdates) return;
      set({ status: "checking", error: null });
      try {
        const result = await native.checkForUpdates();
        if (result.available && result.version) offer({ version: result.version, releaseNotes: result.releaseNotes });
        else set({ status: "idle", error: result.error || null });
      } catch (error) {
        set(failure(error, "Failed to check for updates"));
      }
    },

    skipUpdate: () => set({ isDialogOpen: false, dismissedVersion: get().updateInfo?.version ?? null }),

    openDialog: () => {
      if (get().updateInfo) set({ isDialogOpen: true });
    },

    startDownload: async () => {
      const native = window.waveNative;
      if (!native?.downloadUpdate) return;
      set({ isDialogOpen: false, status: "downloading", error: null });
      try {
        const result = await native.downloadUpdate();
        if (!result.success && result.error) set({ status: "error", error: result.error });
      } catch (error) {
        set(failure(error, "Download failed"));
      }
    },

    installUpdate: async () => {
      try {
        await window.waveNative?.quitAndInstall?.();
      } catch (error) {
        set(failure(error, "Installation failed"));
      }
    },

    reset: () => set(IDLE),

    initUpdaterListeners: () => {
      const native = window.waveNative;
      const unsubscribers = [
        native?.onUpdateAvailable?.(offer),
        native?.onUpdateDownloadProgress?.((progress) => set({ status: "downloading", downloadProgress: progress })),
        native?.onUpdateDownloaded?.(({ version }) => set((state) => ({ status: "downloaded", updateInfo: { ...state.updateInfo, version } }))),
        native?.onUpdateError?.(({ message }) => set({ status: "error", error: message })),
      ];
      return () => unsubscribers.forEach((unsubscribe) => unsubscribe?.());
    },
  };
});
