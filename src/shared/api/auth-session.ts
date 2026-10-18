import type { AuthTokens } from "../contracts";
import { log } from "@/shared/utils/logger";
import { getApiBaseUrl } from "./baseUrl";

export type { AuthTokens };

export const AUTH_STORAGE_KEY = "wave_auth_session";
export const AUTH_CHANGED_EVENT = "auth:changed";

const REFRESH_AHEAD_MS = 120_000;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;

let cached: AuthTokens | null = null;
let pendingRefresh: Promise<AuthTokens | null> | null = null;

function readStored(): AuthTokens | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthTokens) : null;
  } catch (error) {
    log("yellow", "auth", "stored session is unreadable", error);
    return null;
  }
}

function writeStored(next: AuthTokens | null): void {
  try {
    if (next) localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch (error) {
    log("red", "auth", "session could not be stored", error);
  }
}

/** A missing session is read again each time, because another window of the app may have signed in meanwhile. */
export function getAuthSession(): AuthTokens | null {
  if (!cached && typeof window !== "undefined") cached = readStored();
  return cached;
}

export function setAuthSession(next: AuthTokens | null): void {
  cached = next;
  if (typeof window === "undefined") return;
  writeStored(next);
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

/** @returns when the access token expires, in epoch ms, or null when the session does not say */
export function getSessionExpiryMs(session: AuthTokens | null): number | null {
  if (!session?.accessTokenExpiresAt) return null;
  const expiresAt = Date.parse(session.accessTokenExpiresAt);
  return Number.isNaN(expiresAt) ? null : expiresAt;
}

async function postRefreshToken(path: string, refreshToken: string): Promise<Response | null> {
  const body = JSON.stringify({ refreshToken });
  const headers = { "Content-Type": "application/json" };
  try {
    return await fetch(getApiBaseUrl() + path, { method: "POST", headers, body });
  } catch (error) {
    log("yellow", "auth", `${path} did not reach the server`, error);
    return null;
  }
}

function forgetRevoked(refreshToken: string): void {
  if (getAuthSession()?.refreshToken === refreshToken) setAuthSession(null);
}

async function readTokens(response: Response): Promise<AuthTokens | null> {
  try {
    return (await response.json()) as AuthTokens;
  } catch (error) {
    log("red", "auth", "refresh response is not JSON", error);
    return null;
  }
}

/** The server rotates the refresh token on every exchange, so the old one is spent either way. */
async function exchangeRefreshToken(current: AuthTokens): Promise<AuthTokens | null> {
  const response = await postRefreshToken("/v1/auth/refresh", current.refreshToken);
  if (!response) return null;
  if (response.status === HTTP_UNAUTHORIZED || response.status === HTTP_FORBIDDEN) forgetRevoked(current.refreshToken);
  if (!response.ok) return null;
  const next = await readTokens(response);
  if (!next || getAuthSession()?.refreshToken !== current.refreshToken) return null;
  const refreshed = { ...current, ...next, user: next.user ?? current.user };
  setAuthSession(refreshed);
  return refreshed;
}

/**
 * Refreshes the session; parallel callers share one exchange, since a second one would present a spent token.
 * @returns the new session, or null when there is nothing to refresh or the exchange failed
 */
export function refreshAuthSession(): Promise<AuthTokens | null> {
  if (pendingRefresh) return pendingRefresh;
  const current = getAuthSession();
  if (!current?.refreshToken) return Promise.resolve(null);
  pendingRefresh = exchangeRefreshToken(current).finally(() => {
    pendingRefresh = null;
  });
  return pendingRefresh;
}

/**
 * A token close to expiry is refreshed first; if that fails on the network, the old one is used while it still lives.
 * @returns null when signed out or the session has expired
 */
export async function getValidAccessToken(): Promise<string | null> {
  if (pendingRefresh) return (await pendingRefresh)?.accessToken ?? getAuthSession()?.accessToken ?? null;
  const current = getAuthSession();
  if (!current?.accessToken) return null;
  const expiresAt = getSessionExpiryMs(current);
  if (expiresAt === null || expiresAt - Date.now() >= REFRESH_AHEAD_MS) return current.accessToken;
  const refreshed = await refreshAuthSession();
  if (refreshed) return refreshed.accessToken;
  return expiresAt > Date.now() ? current.accessToken : null;
}

/** Signs out locally at once; revoking the token on the server is best effort, the user is leaving either way. */
export async function clearAuthSession(): Promise<void> {
  const current = getAuthSession();
  setAuthSession(null);
  if (!current?.refreshToken) return;
  const response = await postRefreshToken("/v1/auth/logout", current.refreshToken);
  if (response && !response.ok) log("yellow", "auth", `logout answered ${response.status}`);
}
