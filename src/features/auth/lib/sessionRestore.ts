import { api, ApiError, getAuthSession, refreshAuthSession, setAuthSession, type AuthTokens, type PublicUser } from "@/shared/api";
import { log } from "@/shared/utils/logger";

export type AuthStatus = "initializing" | "authenticated" | "anonymous";

export interface SessionState {
  status: AuthStatus;
  user: PublicUser | null;
}

const PROFILE_TIMEOUT_MS = 6000;
const REJECTED_STATUSES = new Set([401, 403]);

export const ANONYMOUS: SessionState = { status: "anonymous", user: null };

function authenticated(user: PublicUser | null): SessionState {
  return { status: "authenticated", user };
}

function signOut(): SessionState {
  setAuthSession(null);
  return ANONYMOUS;
}

function isRejected(error: unknown): boolean {
  return error instanceof ApiError && REJECTED_STATUSES.has(error.status);
}

function fetchProfile(): Promise<PublicUser> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Auth initialize timeout")), PROFILE_TIMEOUT_MS);
  });
  return Promise.race([api.getMe(), timeout]).finally(() => clearTimeout(timer));
}

async function fetchProfileOrNull(): Promise<PublicUser | null> {
  try {
    return await api.getMe();
  } catch (error) {
    log("yellow", "auth", "profile after refresh failed to load", error);
    return null;
  }
}

/** Writing the session also announces `auth:changed`, which reloads the library for this account. */
function rememberUser(user: PublicUser | null): PublicUser | null {
  const current = getAuthSession();
  if (current) setAuthSession({ ...current, user: user ?? current.user });
  return user ?? current?.user ?? null;
}

/** A rejected refresh token clears the session itself, so a session still here after a failed refresh means the network failed. */
async function recoverSession(stored: AuthTokens): Promise<SessionState> {
  const current = getAuthSession();
  if (!current?.refreshToken) return signOut();
  const refreshed = await refreshAuthSession();
  if (refreshed) return authenticated(rememberUser(await fetchProfileOrNull()) ?? refreshed.user ?? stored.user);
  const remaining = getAuthSession();
  return remaining ? authenticated(remaining.user ?? stored.user) : signOut();
}

/**
 * Confirms a stored session with the server. Offline or on a server failure the stored session is
 * kept, so the app opens signed in; only a rejected token leads to a refresh or sign-out.
 */
export async function restoreSession(stored: AuthTokens): Promise<SessionState> {
  try {
    return authenticated(rememberUser(await fetchProfile()) ?? stored.user);
  } catch (error) {
    if (isRejected(error)) return recoverSession(stored);
    log("yellow", "auth", "session check did not reach the server", error);
    return authenticated(stored.user ?? null);
  }
}
