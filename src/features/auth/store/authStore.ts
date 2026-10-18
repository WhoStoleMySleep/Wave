import { create } from "zustand";
import { api, clearAuthSession, getAuthSession, setAuthSession, type PublicUser, type UpdateProfileInput } from "@/shared/api";
import { usePlayerStore, playerRuntime } from "@/features/player";
import { log } from "@/shared/utils/logger";
import { ANONYMOUS, restoreSession, type AuthStatus } from "../lib/sessionRestore";

export { authErrorMessage, getAuthErrorCode } from "../lib/authErrors";
export type { AuthStatus } from "../lib/sessionRestore";

export interface AuthState {
  status: AuthStatus;
  user: PublicUser | null;
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, username: string, displayName: string) => Promise<void>;
  updateProfile: (patch: UpdateProfileInput) => Promise<PublicUser>;
  logout: () => Promise<void>;
}

const PLAYER_ROUTE = "/player";

function notifyLibraryChanged() {
  window.dispatchEvent(new Event("library:changed"));
}

const LOGOUT_STEPS: (() => void)[] = [
  () => usePlayerStore.getState().dispatch({ type: "PAUSE_REQUESTED" }),
  () => playerRuntime?.pause(),
  () => usePlayerStore.getState().setFullscreen(false),
  () => window.waveNative?.closeOverlay?.(),
  () => window.waveNative?.sendOverlayAction?.({ type: "closeOverlay" }),
];

/** Playback, the fullscreen player and the native overlay belong to the leaving account; one failing step must not keep the rest open. */
function stopPlayback() {
  for (const step of LOGOUT_STEPS) {
    try {
      step();
    } catch (error) {
      log("yellow", "auth", "a logout step failed", error);
    }
  }
  if (window.location.hash.includes(PLAYER_ROUTE)) window.location.hash = "#/";
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "initializing",
  user: null,

  initialize: async () => {
    const stored = getAuthSession();
    if (!stored) return set(ANONYMOUS);
    if (stored.user) set({ status: "authenticated", user: stored.user });
    set(await restoreSession(stored));
  },

  login: async (email, password) => {
    const { user } = await api.login(email, password);
    set({ status: "authenticated", user });
    notifyLibraryChanged();
  },

  register: async (email, password, username, displayName) => {
    const { user } = await api.register({ email, password, username, displayName });
    set({ status: "authenticated", user });
    notifyLibraryChanged();
  },

  updateProfile: async (patch) => {
    const updated = await api.updateProfile(patch);
    const current = getAuthSession();
    if (current) setAuthSession({ ...current, user: { ...current.user, ...updated } });
    set((state) => ({ user: state.user ? { ...state.user, ...updated } : updated }));
    return updated;
  },

  logout: async () => {
    stopPlayback();
    await clearAuthSession();
    set(ANONYMOUS);
    notifyLibraryChanged();
  },
}));
