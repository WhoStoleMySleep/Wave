import { invoke } from "@tauri-apps/api/core";
import { AUTH_CHANGED_EVENT, AUTH_STORAGE_KEY, setAuthSession, type AuthTokens } from "@/shared/api/auth-session";

/**
 * Mirrors the auth session into a file the shell writes synchronously. The
 * server rotates the refresh token on every refresh, and WebView localStorage
 * can lose its latest write when the OS kills the app, which leaves only the
 * revoked token behind. The file wins on startup; every later change is
 * copied to it in order.
 */
export async function installAuthPersistence(): Promise<void> {
  const stored = await invoke<string | null>("auth_session_read").catch((err) => {
    console.warn("[auth] durable session read failed:", err);
    return undefined;
  });
  // a failed read must not overwrite the file with a possibly stale local copy
  if (stored === undefined) return;

  const local = localStorage.getItem(AUTH_STORAGE_KEY);
  if (stored && stored !== local) {
    try {
      setAuthSession(JSON.parse(stored) as AuthTokens);
    } catch {
      console.warn("[auth] durable session is corrupt, keeping the local one");
    }
  } else if (!stored && local) {
    // a session from a build that predates the file
    void invoke("auth_session_write", { value: local }).catch(() => {});
  }

  let queue: Promise<unknown> = Promise.resolve();
  window.addEventListener(AUTH_CHANGED_EVENT, () => {
    const value = localStorage.getItem(AUTH_STORAGE_KEY);
    queue = queue
      .then(() => invoke("auth_session_write", { value }))
      .catch((err) => console.warn("[auth] durable session write failed:", err));
  });
}
