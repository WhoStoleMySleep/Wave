import { onBackButtonPress } from "@tauri-apps/api/app";
import { getAndroidShell } from "../android";

const ROOT_PATHS = new Set(["/", "/login"]);

/**
 * Replays the hardware back button as Escape, which already closes the
 * topmost layer (dialog, search, queue, full player). Returns whether one of
 * the handlers took it: they either cancel the event or stop it before it
 * reaches the window.
 */
function closeTopLayer(): boolean {
  let reachedWindow = false;
  const sentinel = (event: KeyboardEvent) => {
    reachedWindow = !event.defaultPrevented;
  };
  window.addEventListener("keydown", sentinel);
  const event = new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true });
  (document.activeElement ?? document.body).dispatchEvent(event);
  window.removeEventListener("keydown", sentinel);
  return event.defaultPrevented || !reachedWindow;
}

/**
 * Android back: close the top layer, then walk the history, and on the home
 * screen send the app to the background instead of letting Android finish the
 * activity, which would stop the music.
 */
export async function installBackButton(): Promise<void> {
  await onBackButtonPress(({ canGoBack }) => {
    if (closeTopLayer()) return;
    const path = window.location.hash.replace(/^#/, "").split("?")[0] || "/";
    if (canGoBack && !ROOT_PATHS.has(path)) {
      window.history.back();
      return;
    }
    getAndroidShell()?.moveToBack();
  });
}
