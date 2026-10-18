import { useEffect, useRef } from "react";
import { playerEngine, usePlayerStore, toVolumeGain, toVolumeLevel } from "@/features/player";
import {
  hasBlockingModifier,
  isBlockingOverlayOpen,
  isKeyHandledByFocusedControl,
  isTypingTarget,
} from "../utils/shortcutGuards";

export type RightPanelTab = "queue" | "lyrics";

export interface GlobalShortcutsOptions {
  enabled?: boolean;
  searchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  rightPanelOpen: boolean;
  rightPanelTab: RightPanelTab;
  openRightPanel: (tab: RightPanelTab) => void;
  closeRightPanel: () => void;
  fullscreenOpen: boolean;
  openFullscreen: () => void;
  closeFullscreen: () => void;
  onEscapeFallback?: () => boolean;
}

interface ShortcutContext {
  options: GlobalShortcutsOptions;
  volume: { lastUnmuted: number };
}

const VOLUME_STEP = 0.05;
const SEEK_STEP_MS = 5_000;
const DEFAULT_UNMUTE_LEVEL = 0.7;
const VOLUME_PRECISION = 100;
const NON_REPEATABLE_CODES = new Set(["Space", "KeyF", "KeyQ", "KeyL", "KeyM", "Slash", "Escape"]);

function seekBy(deltaMs: number) {
  const { positionMs, durationMs } = usePlayerStore.getState();
  const target = positionMs + deltaMs;
  const end = durationMs > 0 ? durationMs : target;
  playerEngine.seek(Math.max(0, Math.min(end, target)));
}

function stepVolume({ volume }: ShortcutContext, delta: number) {
  const level = toVolumeLevel(usePlayerStore.getState().volume) + delta;
  const next = Math.round(Math.max(0, Math.min(1, level)) * VOLUME_PRECISION) / VOLUME_PRECISION;
  playerEngine.setVolume(toVolumeGain(next));
  if (next > 0) volume.lastUnmuted = next;
}

/** Unmuting returns to the level the user last had, not to full volume. */
function toggleMute({ volume }: ShortcutContext) {
  const level = toVolumeLevel(usePlayerStore.getState().volume);
  if (level > 0) volume.lastUnmuted = level;
  playerEngine.setVolume(level > 0 ? 0 : toVolumeGain(volume.lastUnmuted || DEFAULT_UNMUTE_LEVEL));
}

function toggleFullscreen({ options }: ShortcutContext) {
  if (options.fullscreenOpen) return options.closeFullscreen();
  const { currentTrack, status } = usePlayerStore.getState();
  if (currentTrack !== null && status !== "idle") options.openFullscreen();
}

function togglePanel({ options }: ShortcutContext, tab: RightPanelTab) {
  if (options.rightPanelOpen && options.rightPanelTab === tab) options.closeRightPanel();
  else options.openRightPanel(tab);
}

const ACTIONS = new Map<string, (context: ShortcutContext) => void>([
  ["Space", () => void playerEngine.togglePlayPause()],
  ["KeyF", toggleFullscreen],
  ["KeyQ", (context) => togglePanel(context, "queue")],
  ["KeyL", (context) => togglePanel(context, "lyrics")],
  ["KeyM", toggleMute],
  ["Slash", ({ options }) => options.openSearch()],
  ["ArrowLeft", () => seekBy(-SEEK_STEP_MS)],
  ["ArrowRight", () => seekBy(SEEK_STEP_MS)],
  ["ArrowUp", (context) => stepVolume(context, VOLUME_STEP)],
  ["ArrowDown", (context) => stepVolume(context, -VOLUME_STEP)],
]);

/** Escape closes only the topmost layer: search, then the side panel, then the fullscreen player. */
function closeTopLayer(options: GlobalShortcutsOptions): boolean {
  const layers: [boolean, () => void][] = [
    [options.searchOpen, options.closeSearch],
    [options.rightPanelOpen, options.closeRightPanel],
    [options.fullscreenOpen, options.closeFullscreen],
  ];
  const open = layers.find(([isOpen]) => isOpen);
  if (!open) return Boolean(options.onEscapeFallback?.());
  open[1]();
  return true;
}

function handleEscape(event: KeyboardEvent, options: GlobalShortcutsOptions) {
  if (isBlockingOverlayOpen() || !closeTopLayer(options)) return;
  event.preventDefault();
  event.stopPropagation();
}

function isIgnored(event: KeyboardEvent, options: GlobalShortcutsOptions): boolean {
  if (options.enabled === false || event.defaultPrevented || !document.hasFocus()) return true;
  return event.repeat && NON_REPEATABLE_CODES.has(event.code);
}

/** Keys reach the player only when no text field, modal or focused control would use them itself. */
function yieldsToPage(event: KeyboardEvent): boolean {
  return hasBlockingModifier(event) || isTypingTarget(event.target) || isBlockingOverlayOpen() || isKeyHandledByFocusedControl(event.target, event.code);
}

function handleKey(event: KeyboardEvent, context: ShortcutContext) {
  if (isIgnored(event, context.options)) return;
  if (event.code === "Escape" || event.key === "Escape") return handleEscape(event, context.options);
  const action = ACTIONS.get(event.code);
  if (!action || yieldsToPage(event)) return;
  event.preventDefault();
  action(context);
}

export function useGlobalShortcuts(options: GlobalShortcutsOptions): void {
  const context = useRef<ShortcutContext>({ options, volume: { lastUnmuted: DEFAULT_UNMUTE_LEVEL } });
  context.current.options = options;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => handleKey(event, context.current);
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
