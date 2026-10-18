import { useSyncExternalStore } from "react";

/** Matches Tailwind's `max-md`, so JS and CSS switch layouts together. */
const COMPACT_QUERY = "(max-width: 767px)";

/** True inside the Android/iOS shell, where there is no window to manage. */
export function isMobilePlatform(): boolean {
  const platform = typeof window !== "undefined" ? window.waveNative?.platform : undefined;
  return platform === "android" || platform === "ios";
}

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia?.(COMPACT_QUERY);
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return Boolean(window.matchMedia?.(COMPACT_QUERY).matches);
}

/**
 * Whether to render the phone layout. It follows the viewport rather than the
 * platform, so tablets keep the wide layout and the desktop window, whose
 * minimum width is far above the breakpoint, never switches.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
