import { onConnectivityRestored } from "@/features/connectivity";
import { api, ApiError, type PlaybackEvent } from "@/shared/api";
import { AUTH_CHANGED_EVENT, getAuthSession } from "@/shared/api/auth-session";
import { log } from "@/shared/utils/logger";
import { errorMessage } from "./engineUtils";

const STORAGE_KEY = "wave_pending_listens";
/** Weeks of listening without network; past this the oldest listens go, so storage stays small. */
const MAX_PENDING = 1000;
/** Sent listens are written off in batches: the list is rewritten whole, and a listen sent twice is harmless. */
const SAVE_EVERY = 20;

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_TIMEOUT = 408;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR = 500;

interface PendingListen {
  userId: string;
  event: PlaybackEvent;
}

/** The server refused this listen for good, so sending it again cannot help. */
function isRefused(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const { status } = error;
  const retryable = [HTTP_UNAUTHORIZED, HTTP_FORBIDDEN, HTTP_TIMEOUT, HTTP_TOO_MANY_REQUESTS];
  return status >= HTTP_BAD_REQUEST && status < HTTP_SERVER_ERROR && !retryable.includes(status);
}

function currentUserId(): string {
  return getAuthSession()?.user.id ?? "";
}

/**
 * Listens wait on the device until the server takes them, so plays without
 * network still reach the account's history and stats. Each listen remembers
 * whose it is and goes only to that account. The server keys a listen by its
 * playback session id, so one sent again overwrites itself instead of adding a play.
 */
export class ListenOutbox {
  private pending: PendingListen[] | null = null;
  private draining: Promise<void> | null = null;

  constructor(private readonly storage: Storage = localStorage) {}

  add(event: PlaybackEvent): void {
    this.list().push({ userId: currentUserId(), event });
    this.pending = this.list().slice(-MAX_PENDING);
    this.save();
    void this.drain();
  }

  /**
   * Sends the waiting listens again whenever the network or the account comes back.
   * @returns stops watching
   */
  watch(): () => void {
    const drain = () => void this.drain();
    window.addEventListener("online", drain);
    window.addEventListener(AUTH_CHANGED_EVENT, drain);
    const unsubscribe = onConnectivityRestored(drain);
    return () => {
      window.removeEventListener("online", drain);
      window.removeEventListener(AUTH_CHANGED_EVENT, drain);
      unsubscribe();
    };
  }

  /** Sends the current account's listens oldest first and stops at the first that cannot get through. */
  drain(): Promise<void> {
    this.draining ??= this.sendWaiting().finally(() => (this.draining = null));
    return this.draining;
  }

  private async sendWaiting(): Promise<void> {
    let unsaved = 0;
    try {
      for (let next = this.nextOfCurrentUser(); next; next = this.nextOfCurrentUser()) {
        if (!(await this.send(next.event))) return;
        this.pending = this.list().filter((listen) => listen !== next);
        if (++unsaved >= SAVE_EVERY) {
          this.save();
          unsaved = 0;
        }
      }
    } finally {
      if (unsaved > 0) this.save();
    }
  }

  /** @returns whether the listen is done with: taken, or refused for good */
  private async send(event: PlaybackEvent): Promise<boolean> {
    try {
      await api.recordPlaybackEvent(event);
      return true;
    } catch (error) {
      if (isRefused(error)) {
        log("yellow", "telemetry", `listen of ${event.trackId} refused: ${errorMessage(error)}`);
        return true;
      }
      log("yellow", "telemetry", `listen of ${event.trackId} waits for the server: ${errorMessage(error)}`);
      return false;
    }
  }

  private nextOfCurrentUser(): PendingListen | undefined {
    const userId = currentUserId();
    return this.list().find((listen) => listen.userId === userId);
  }

  private list(): PendingListen[] {
    this.pending ??= this.load();
    return this.pending;
  }

  private load(): PendingListen[] {
    try {
      const parsed: unknown = JSON.parse(this.storage.getItem(STORAGE_KEY) ?? "[]");
      return Array.isArray(parsed) ? (parsed as PendingListen[]) : [];
    } catch (error) {
      log("yellow", "telemetry", "waiting listens are unreadable", error);
      return [];
    }
  }

  private save(): void {
    try {
      if (this.list().length > 0) this.storage.setItem(STORAGE_KEY, JSON.stringify(this.list()));
      else this.storage.removeItem(STORAGE_KEY);
    } catch (error) {
      log("red", "telemetry", "waiting listens could not be saved", error);
    }
  }
}
