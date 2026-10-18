import { isTauri } from "@tauri-apps/api/core";

/**
 * Installs the Tauri-backed native bridge before the app renders. Resolves
 * immediately outside Tauri (a plain browser tab).
 */
export async function installTauriBridge(): Promise<void> {
  if (!isTauri() || window.waveNative) return;
  const { createTauriBridge } = await import("./bridge");
  window.waveNative = await createTauriBridge();
  const { installAuthPersistence } = await import("./authPersistence");
  await installAuthPersistence();
  routeExternalLinks();
  if (window.waveNative.platform === "android") {
    const { installBackButton } = await import("./backButton");
    await installBackButton().catch((err) => console.warn("[back] listener failed:", err));
  }
}

/** Webviews ignore `target="_blank"` and `window.open`, so hand web links to the OS browser. */
function routeExternalLinks(): void {
  const isWebUrl = (url: string) => /^https?:\/\//i.test(url);
  const openExternal = (url: string) =>
    void import("@tauri-apps/plugin-opener").then(({ openUrl }) => openUrl(url)).catch(() => {});

  window.open = (url) => {
    const href = url ? String(url) : "";
    if (isWebUrl(href)) openExternal(href);
    return null;
  };
  document.addEventListener("click", (event) => {
    const anchor = (event.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!anchor || anchor.target !== "_blank" || !isWebUrl(anchor.href)) return;
    event.preventDefault();
    openExternal(anchor.href);
  });
}
