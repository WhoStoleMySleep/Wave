import type { DeeplinkTarget } from "./deeplink";

export type { DeeplinkTarget };

export interface MainDnsCheck {
  host: string;
  ok: boolean;
  addresses?: string[];
  resolvers?: string[];
  ms: number;
  error?: string;
}

export interface MainTcpCheck {
  host: string;
  port: number;
  ok: boolean;
  ms: number;
  error?: string;
}

export interface MainTlsCheck {
  host: string;
  ok: boolean;
  protocol?: string;
  authorized?: boolean;
  subject?: string;
  issuer?: string;
  ms: number;
  error?: string;
}

export interface MainControlCheck {
  name: string;
  ok: boolean;
  status?: number;
  detail?: string;
  ms: number;
  error?: string;
}

export interface MainTraceResult {
  host: string;
  ok: boolean;
  hops: string[];
  ms: number;
  error?: string;
}

export interface MainNetResult {
  dns: MainDnsCheck[];
  tcp: MainTcpCheck[];
  tls: MainTlsCheck[];
  controls: MainControlCheck[];
  trace: MainTraceResult | null;
  platform: string;
}

// first line is a header ("traceroute to …", "Tracing route …"), rest are hops.
// keeps raw hop lines (capped) since hop formats differ per os and tool.

export interface NativeCacheStats {
  cacheSize: number;
  httpCacheSize: number;
  codeCacheSize: number;
  serviceWorkerSize: number;
  indexedDbSize: number;
  localStorageSize: number;
  blobStorageSize: number;
  cachePath: string;
}

export interface UpdateInfo {
  version: string;
  releaseNotes?: string;
  releaseDate?: string;
}

export interface UpdateDownloadProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export interface WindowState {
  isMaximized: boolean;
  isFullScreen: boolean;
}

export interface WaveNativeApi {
  platform: string;
  isHyprland: boolean;
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  toggleFullScreen: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  isFullScreen: () => Promise<boolean>;
  onWindowStateChange: (cb: (state: WindowState) => void) => () => void;
  startWindowMove: () => void;
  dragStart: () => void;
  dragMove: (deltaX: number, deltaY: number) => void;
  dragEnd: () => void;
  onDeeplink: (cb: (target: DeeplinkTarget) => void) => () => void;
  diagnoseNetwork: (hosts: string[]) => Promise<MainNetResult>;
  openDownloads: (customPath?: string) => Promise<boolean>;
  openExportFolder: (customPath?: string) => Promise<boolean>;
  saveDump: (input: { filename: string; content: string }) => Promise<{
    success: boolean;
    filePath?: string;
    canceled?: boolean;
    error?: string;
  }>;
  setAppIcon: (dataUrl: string) => Promise<void>;
  getAppVersion: () => Promise<string>;
  getCacheStats: () => Promise<NativeCacheStats>;
  openCacheFolder: () => Promise<boolean>;
  clearCoversCache: () => Promise<boolean>;
  clearAudioCache: (clearEntireDb?: boolean) => Promise<boolean>;
  clearHttpCache: () => Promise<boolean>;
  checkForUpdates: () => Promise<{ available: boolean; version?: string; releaseNotes?: string; error?: string }>;
  downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
  quitAndInstall: () => Promise<boolean>;
  onUpdateAvailable: (cb: (info: UpdateInfo) => void) => () => void;
  onUpdateDownloadProgress: (cb: (progress: UpdateDownloadProgress) => void) => () => void;
  onUpdateDownloaded: (cb: (info: { version: string }) => void) => () => void;
  onUpdateError: (cb: (err: { message: string }) => void) => () => void;
  // OTA Frontend Bundle Updater
  bundleCheck: () => Promise<{ available: boolean; manifest?: any; reason?: string }>;
  bundleDownloadAndInstall: (manifest: any) => Promise<{ success: boolean; error?: string }>;
  bundleHotSwap: () => Promise<boolean>;
  bundleRollback: () => Promise<boolean>;
  bundleGetStatus: () => Promise<{
    appVersion: string;
    bundleVersion: string;
    isOta: boolean;
    sha256: string | null;
    effectivePath: string;
  }>;
  onBundleAvailable: (cb: (manifest: any) => void) => () => void;
  onBundleDownloadProgress: (cb: (progress: { percent: number; transferred: number; total: number }) => void) => () => void;
  onBundleReady: (cb: (state: any) => void) => () => void;
  overlayUpdateState: (state: any) => void;
  onOverlayAction: (cb: (action: any) => void) => () => void;
  sendOverlayAction: (action: any) => void;
  toggleOverlay: () => Promise<boolean>;
  isOverlayOpen: () => Promise<boolean>;
  closeOverlay: () => void;
  onOverlayState: (cb: (state: any) => void) => () => void;
  getOverlayInitialState: () => Promise<any>;
  updateOverlaySettings: (settings: any) => void;
  onOverlaySettingsChanged: (cb: (settings: any) => void) => () => void;
  onOverlayVisibility: (cb: (visible: boolean) => void) => () => void;
  /** Reports another app starting and stopping sound; absent where the shell can't tell. */
  watchOtherAudio?: (cb: (active: boolean) => void) => () => void;
}
