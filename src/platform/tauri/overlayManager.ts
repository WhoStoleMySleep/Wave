import { emitTo, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { currentMonitor, getCurrentWindow, primaryMonitor, type BackgroundThrottlingPolicy } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { normalizeShortcut } from "../shortcut";

export type OverlayPosition = "top-left" | "top-center" | "top-right";

export interface OverlaySettings {
  enabled: boolean;
  position: OverlayPosition;
  shortcut: string;
  autoShowOnMinimize: boolean;
  alwaysOnTop: boolean;
}

export const OVERLAY_LABEL = "overlay";
export const OVERLAY_EVENTS = {
  state: "overlay:state",
  visibility: "overlay:visibility",
  action: "overlay:action",
  /** Overlay window → main: an action or a manager call the main window must run. */
  request: "overlay:request",
} as const;

const SETTINGS_KEY = "wave_overlay_settings";
const WIDTH = 320;
const HEIGHT = 56;
const PADDING = 20;
const CLOSE_DELAY_MS = 90;

const DEFAULT_SETTINGS: OverlaySettings = {
  enabled: true,
  position: "top-center",
  shortcut: "Alt+Shift+O",
  autoShowOnMinimize: true,
  alwaysOnTop: true,
};

function loadSettings(): OverlaySettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

/**
 * Runs inside the main window, which owns the overlay webview and relays
 * playback state to it.
 */
export class TauriOverlayManager {
  private settings = loadSettings();
  private latestState: unknown = null;
  private overlay: WebviewWindow | null = null;
  private visible = false;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private registeredShortcut: string | null = null;
  private wasAutoOpened = false;
  private actionListeners = new Set<(action: any) => void>();
  private unlisteners: UnlistenFn[] = [];

  async init(): Promise<void> {
    const main = getCurrentWindow();
    let wasMinimized = false;
    this.unlisteners.push(
      // tauri has no minimize event; minimizing shows up as a resize
      await main.onResized(async () => {
        const minimized = await main.isMinimized();
        if (minimized === wasMinimized) return;
        wasMinimized = minimized;
        if (minimized) {
          if (!this.settings.enabled || !this.settings.autoShowOnMinimize) return;
          this.wasAutoOpened = true;
          void this.show();
        } else if (this.wasAutoOpened) {
          this.wasAutoOpened = false;
          this.close();
        }
      }),
      await listen<{ type: string; payload?: any }>(OVERLAY_EVENTS.request, ({ payload }) => {
        void this.handleRequest(payload);
      }),
    );
    await this.registerShortcut();
  }

  onAction(cb: (action: any) => void): () => void {
    this.actionListeners.add(cb);
    return () => this.actionListeners.delete(cb);
  }

  updateState(state: unknown): void {
    this.latestState = state;
    if (this.overlay) void emitTo(OVERLAY_LABEL, OVERLAY_EVENTS.state, state);
  }

  isOpen(): boolean {
    return Boolean(this.overlay) && this.visible;
  }

  async toggle(): Promise<boolean> {
    if (!this.settings.enabled) {
      this.close();
      return false;
    }
    this.wasAutoOpened = false;
    if (this.overlay && this.visible && !this.closeTimer) {
      this.close();
      return false;
    }
    await this.show();
    return true;
  }

  async show(): Promise<void> {
    if (!this.settings.enabled) return;
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }

    const bounds = await this.computeBounds();
    if (!this.overlay) {
      this.overlay = this.createWindow();
    }
    const overlay = this.overlay;
    await overlay.setSize(new PhysicalSize(bounds.width, bounds.height));
    await overlay.setPosition(new PhysicalPosition(bounds.x, bounds.y));
    if (this.latestState) await emitTo(OVERLAY_LABEL, OVERLAY_EVENTS.state, this.latestState);
    await emitTo(OVERLAY_LABEL, OVERLAY_EVENTS.visibility, true);
    await overlay.show();
    this.visible = true;
  }

  close(): void {
    this.wasAutoOpened = false;
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    const overlay = this.overlay;
    if (!overlay || !this.visible) return;

    // lets the overlay play its fade-out before the window disappears
    void emitTo(OVERLAY_LABEL, OVERLAY_EVENTS.visibility, false);
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      this.visible = false;
      void overlay.hide();
    }, CLOSE_DELAY_MS);
  }

  async updateSettings(patch: Partial<OverlaySettings>): Promise<void> {
    if (!patch || typeof patch !== "object") return;
    const prev = this.settings;
    const next = { ...prev };

    if (typeof patch.enabled === "boolean") next.enabled = patch.enabled;
    if (patch.position === "top-left" || patch.position === "top-center" || patch.position === "top-right") {
      next.position = patch.position;
    }
    if (typeof patch.shortcut === "string" && patch.shortcut.trim()) next.shortcut = patch.shortcut.trim();
    if (typeof patch.autoShowOnMinimize === "boolean") next.autoShowOnMinimize = patch.autoShowOnMinimize;
    if (typeof patch.alwaysOnTop === "boolean") next.alwaysOnTop = patch.alwaysOnTop;

    this.settings = next;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {}

    if (!next.enabled) this.close();
    if (next.enabled !== prev.enabled || next.shortcut !== prev.shortcut) await this.registerShortcut();
    if (this.overlay) {
      if (next.alwaysOnTop !== prev.alwaysOnTop) await this.overlay.setAlwaysOnTop(next.alwaysOnTop);
      if (next.position !== prev.position) {
        const bounds = await this.computeBounds();
        await this.overlay.setPosition(new PhysicalPosition(bounds.x, bounds.y));
      }
    }
  }

  private async handleRequest(request: { type: string; payload?: any }): Promise<void> {
    switch (request?.type) {
      case "getState":
        if (this.latestState) await emitTo(OVERLAY_LABEL, OVERLAY_EVENTS.state, this.latestState);
        return;
      case "closeOverlay":
        this.close();
        return;
      case "toggle":
        await this.toggle();
        return;
      case "updateSettings":
        await this.updateSettings(request.payload);
        return;
      case "focusMainWindow": {
        const main = getCurrentWindow();
        await main.unminimize();
        await main.show();
        await main.setFocus();
        return;
      }
      case "action":
        this.dispatchAction(request.payload);
        return;
    }
  }

  dispatchAction(action: any): void {
    if (action?.type === "closeOverlay" || action?.type === "focusMainWindow") {
      void this.handleRequest({ type: action.type });
      return;
    }
    for (const cb of this.actionListeners) cb(action);
  }

  private createWindow(): WebviewWindow {
    const overlay = new WebviewWindow(OVERLAY_LABEL, {
      url: "/#/overlay",
      title: "Wave Overlay",
      width: WIDTH,
      height: HEIGHT,
      decorations: false,
      transparent: true,
      shadow: false,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: this.settings.alwaysOnTop,
      visibleOnAllWorkspaces: true,
      focus: false,
      visible: false,
      // the enum is exported as a type only
      backgroundThrottling: "disabled" as BackgroundThrottlingPolicy,
    });
    void overlay.once("tauri://destroyed", () => {
      if (this.overlay === overlay) {
        this.overlay = null;
        this.visible = false;
      }
    });
    return overlay;
  }

  private async computeBounds() {
    const monitor = (await currentMonitor()) ?? (await primaryMonitor());
    const scale = monitor?.scaleFactor ?? 1;
    const area = monitor?.workArea ?? {
      position: { x: 0, y: 0 },
      size: { width: window.screen.availWidth * scale, height: window.screen.availHeight * scale },
    };
    const width = Math.round(WIDTH * scale);
    const height = Math.round(HEIGHT * scale);
    const padding = Math.round(PADDING * scale);

    let x: number;
    switch (this.settings.position) {
      case "top-left":
        x = area.position.x + padding;
        break;
      case "top-right":
        x = area.position.x + area.size.width - width - padding;
        break;
      default:
        x = area.position.x + Math.round((area.size.width - width) / 2);
    }
    return { x, y: area.position.y + padding, width, height };
  }

  private async registerShortcut(): Promise<void> {
    if (this.registeredShortcut) {
      await unregister(this.registeredShortcut).catch(() => {});
      this.registeredShortcut = null;
    }
    const shortcut = normalizeShortcut(this.settings.shortcut);
    if (!this.settings.enabled || !shortcut) return;
    try {
      await register(shortcut, (event) => {
        if (event.state === "Pressed" && this.settings.enabled) void this.toggle();
      });
      this.registeredShortcut = shortcut;
    } catch (err) {
      console.warn("[overlay] failed to register global shortcut:", shortcut, err);
    }
  }
}
