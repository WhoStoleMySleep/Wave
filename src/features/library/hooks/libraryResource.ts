import { getAuthSession } from "@/shared/api";
import { onConnectivityRestored } from "@/features/connectivity/store/connectivityStore";
import { log } from "@/shared/utils/logger";
import { readLibrarySnapshot, writeLibrarySnapshot } from "./librarySnapshot";

export interface LibraryView<T> {
  data: T;
  error: unknown;
  isLoading: boolean;
}

export interface LibraryResourceOptions<T> {
  snapshotKey: string;
  empty: T;
  fetch: () => Promise<T>;
  isEmpty: (data: T) => boolean;
  present?: (data: T) => T;
  onLoaded?: (data: T) => void;
  onCleared?: () => void;
}

function hasSession(): boolean {
  return Boolean(getAuthSession()?.accessToken);
}

/**
 * A signed-in user's library list shared by every screen: the saved snapshot shows first, then the
 * fresh copy replaces it. A failed refresh over saved data is the normal offline case, so the
 * error is reported only when there is nothing to show.
 */
export class LibraryResource<T> {
  private data: T;
  private loaded = false;
  private failed = false;
  private error: unknown = undefined;
  private request: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();
  private view: LibraryView<T>;
  public readonly serverView: LibraryView<T>;

  public constructor(private readonly options: LibraryResourceOptions<T>) {
    this.data = options.empty;
    this.view = { data: options.empty, error: undefined, isLoading: true };
    this.serverView = this.view;
  }

  public readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  public readonly getView = (): LibraryView<T> => this.view;

  public load(force = false): Promise<void> {
    if (this.request) return this.request;
    if (!hasSession()) {
      this.clear();
      return Promise.resolve();
    }
    if (this.loaded && !force) return Promise.resolve();
    if (!this.loaded && this.data === this.options.empty) this.publish(true);
    this.request = this.refresh().finally(() => {
      this.request = null;
      this.publish();
    });
    return this.request;
  }

  public update(change: (data: T) => T): void {
    this.data = change(this.data);
    writeLibrarySnapshot(this.options.snapshotKey, this.data);
    this.publish();
  }

  public publish(isLoading = false): void {
    const data = this.options.present?.(this.data) ?? this.data;
    const error = this.failed && this.options.isEmpty(this.data) ? this.error : undefined;
    this.view = { data, error, isLoading };
    this.listeners.forEach((listener) => listener());
  }

  /** Refetches on library or account changes, and after a failed load once the network is back. */
  public watch(): void {
    if (typeof window === "undefined") return;
    const refresh = () => (hasSession() ? void this.load(true) : this.clear());
    window.addEventListener("library:changed", refresh);
    window.addEventListener("auth:changed", refresh);
    onConnectivityRestored(() => {
      if (this.failed) void this.load(true);
    });
  }

  private clear(): void {
    this.data = this.options.empty;
    this.loaded = false;
    this.options.onCleared?.();
    this.publish();
  }

  private async refresh(): Promise<void> {
    await this.restoreSnapshot();
    try {
      this.data = await this.options.fetch();
      this.failed = false;
      writeLibrarySnapshot(this.options.snapshotKey, this.data);
      this.options.onLoaded?.(this.data);
    } catch (error) {
      log("yellow", "library", `${this.options.snapshotKey} failed to load`, error);
      this.failed = true;
      this.error = error;
    }
    this.loaded = true;
  }

  private async restoreSnapshot(): Promise<void> {
    if (this.loaded || this.data !== this.options.empty) return;
    const saved = await readLibrarySnapshot<T>(this.options.snapshotKey);
    if (!saved || this.data !== this.options.empty) return;
    this.data = saved;
    this.publish();
  }
}
