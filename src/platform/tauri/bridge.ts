import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { emitTo, listen } from "@tauri-apps/api/event";
import { appCacheDir } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrent as getCurrentDeepLinks, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import type { DeeplinkTarget, WaveNativeApi, WindowState } from "../native";
import { parseDeeplink } from "../deeplink";
import { OVERLAY_EVENTS, TauriOverlayManager } from "./overlayManager";

const UPDATES_DISABLED = "Updates are disabled in self-built Tauri builds";

function detectPlatform(): string {
  const ua = navigator.userAgent;
  // android reports "Linux" and iPadOS reports "Mac", so phones go first
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua) || (/Mac/i.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Mac/i.test(ua)) return "darwin";
  if (/Win/i.test(ua)) return "win32";
  return "linux";
}

function subscribe<T>(event: string, cb: (payload: T) => void): () => void {
  const pending = listen<T>(event, ({ payload }) => cb(payload));
  return () => void pending.then((off) => off());
}

const noopUnsubscribe = () => () => {};

/**
 * Builds a `window.waveNative`-compatible bridge on top of Tauri so the
 * renderer keeps a single native API regardless of the shell. Auto-update,
 * OTA bundles and the Touch Bar have no Tauri counterpart and report as off.
 */
export async function createTauriBridge(): Promise<WaveNativeApi> {
  const win = getCurrentWindow();
  const isMain = win.label === "main";
  const platform = detectPlatform();
  const [isHyprland, cachePath] = await Promise.all([
    invoke<boolean>("is_hyprland").catch(() => false),
    appCacheDir().catch(() => ""),
  ]);

  const isMobile = platform === "android" || platform === "ios";
  // mobile has no second windows or global shortcuts to host the overlay
  const overlay = isMain && !isMobile ? new TauriOverlayManager() : null;
  if (overlay) await overlay.init().catch((err) => console.warn("[overlay] init failed:", err));

  /** The overlay window has no manager of its own; it asks the main window. */
  const requestMain = (type: string, payload?: unknown) =>
    void emitTo("main", OVERLAY_EVENTS.request, { type, payload });

  const readWindowState = async (): Promise<WindowState> => ({
    isMaximized: await win.isMaximized(),
    isFullScreen: await win.isFullscreen(),
  });

  return {
    platform,
    isHyprland,

    minimize: async () => {
      if (isHyprland || (await win.isFullscreen())) return;
      await win.minimize();
    },
    toggleMaximize: async () => {
      // frameless macOS windows have no maximize, native fullscreen stands in for it
      if (platform === "darwin") {
        await win.setFullscreen(!(await win.isFullscreen()));
      } else if (await win.isFullscreen()) {
        await win.setFullscreen(false);
      } else {
        await win.toggleMaximize();
      }
    },
    toggleFullScreen: async () => win.setFullscreen(!(await win.isFullscreen())),
    close: () => win.close(),
    isMaximized: () => win.isMaximized(),
    isFullScreen: () => win.isFullscreen(),
    onWindowStateChange: (cb) => {
      let last = "";
      const pending = win.onResized(async () => {
        const state = await readWindowState();
        const key = `${state.isMaximized}:${state.isFullScreen}`;
        if (key === last) return;
        last = key;
        cb(state);
      });
      return () => void pending.then((off) => off());
    },
    // the os drag loop moves the window itself, so the manual delta path stays idle
    startWindowMove: () => void win.startDragging().catch(() => {}),
    dragStart: () => {},
    dragMove: () => {},
    dragEnd: () => {},

    onDeeplink: (cb) => {
      const deliver = (urls: string[] | null) => {
        for (const url of urls ?? []) {
          const target: DeeplinkTarget | null = parseDeeplink(url);
          if (target) cb(target);
        }
      };
      void getCurrentDeepLinks().then(deliver).catch(() => {});
      const pending = onOpenUrl(deliver);
      return () => void pending.then((off) => off());
    },

    diagnoseNetwork: (hosts) => invoke("diagnose_network", { hosts }),
    openDownloads: (customPath) => invoke("open_export_folder", { customPath }),
    openExportFolder: (customPath) => invoke("open_export_folder", { customPath }),
    saveDump: (input) => invoke("save_dump", { input }),
    setAppIcon: (dataUrl) => invoke("set_app_icon", { dataUrl }),
    getAppVersion: () => getVersion(),

    // webview storage lives outside the app's control here; the renderer
    // measures and clears indexeddb and cache storage itself
    getCacheStats: async () => ({
      cacheSize: 0,
      httpCacheSize: 0,
      codeCacheSize: 0,
      serviceWorkerSize: 0,
      indexedDbSize: 0,
      localStorageSize: 0,
      blobStorageSize: 0,
      cachePath,
    }),
    openCacheFolder: () => invoke("open_cache_folder"),
    clearCoversCache: async () => true,
    clearAudioCache: async () => true,
    clearHttpCache: async () => true,

    checkForUpdates: async () => ({ available: false, error: UPDATES_DISABLED }),
    downloadUpdate: async () => ({ success: false, error: UPDATES_DISABLED }),
    quitAndInstall: async () => false,
    onUpdateAvailable: noopUnsubscribe,
    onUpdateDownloadProgress: noopUnsubscribe,
    onUpdateDownloaded: noopUnsubscribe,
    onUpdateError: noopUnsubscribe,
    bundleCheck: async () => ({ available: false, reason: UPDATES_DISABLED }),
    bundleDownloadAndInstall: async () => ({ success: false, error: UPDATES_DISABLED }),
    bundleHotSwap: async () => false,
    bundleRollback: async () => false,
    bundleGetStatus: async () => {
      const version = await getVersion();
      return { appVersion: version, bundleVersion: version, isOta: false, sha256: null, effectivePath: "" };
    },
    onBundleAvailable: noopUnsubscribe,
    onBundleDownloadProgress: noopUnsubscribe,
    onBundleReady: noopUnsubscribe,


    overlayUpdateState: (state) => overlay?.updateState(state),
    onOverlayAction: (cb) => overlay?.onAction(cb) ?? (() => {}),
    sendOverlayAction: (action) => (overlay ? overlay.dispatchAction(action) : requestMain("action", action)),
    toggleOverlay: async () => {
      if (overlay) return overlay.toggle();
      requestMain("toggle");
      return false;
    },
    isOverlayOpen: async () => overlay?.isOpen() ?? !isMain,
    closeOverlay: () => (overlay ? overlay.close() : requestMain("closeOverlay")),
    onOverlayState: (cb) => subscribe(OVERLAY_EVENTS.state, cb),
    getOverlayInitialState: async () => {
      let resolveState: (state: unknown) => void = () => {};
      const received = new Promise<unknown>((resolve) => (resolveState = resolve));
      // the listener must be live before asking, or a fast reply is lost
      const off = await listen(OVERLAY_EVENTS.state, ({ payload }) => resolveState(payload));
      requestMain("getState");
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000));
      const state = await Promise.race([received, timeout]);
      off();
      return state;
    },
    updateOverlaySettings: (settings) =>
      overlay ? void overlay.updateSettings(settings) : requestMain("updateSettings", settings),
    onOverlaySettingsChanged: noopUnsubscribe,
    onOverlayVisibility: (cb) => subscribe(OVERLAY_EVENTS.visibility, cb),
  };
}
