import { create } from "zustand";
import { DIAG_ENDPOINTS, probeApi, runAllChecks, type DiagnosticsResult } from "../lib/diagnostics";
import { isPlaybackPath } from "../lib/failureKind";
import { buildOfflineDump, downloadDump, type SaveDumpResult } from "../lib/dump";

export const TRIP_COUNT = 3;
export const TRIP_WINDOW_MS = 60_000;
export const MAX_FAILURES = 20;
/** How often an offline app checks whether the server is reachable again. */
export const RECOVERY_PROBE_MS = 15_000;

export interface FailureEntry {
  at: number;
  method: string;
  path: string;
  status?: number;
  code?: string;
  latencyMs: number;
}

interface ConnectivityState {
  /** The server is unreachable; the app keeps working on downloads and cached data. */
  tripped: boolean;
  running: boolean;
  /** A recovery check is in flight. */
  probing: boolean;
  checks: DiagnosticsResult["checks"];
  main: DiagnosticsResult["main"];
  failures: FailureEntry[];
  lastRunAt?: number;
  lastSavedDumpPath: string | null;
  recordFailure: (entry: Omit<FailureEntry, "at">) => void;
  /** Any successful API response proves the connection is back. */
  recordSuccess: () => void;
  goOffline: () => void;
  probe: () => Promise<void>;
  runDiagnostics: () => Promise<void>;
  retry: () => Promise<void>;
  runAndSaveDump: () => Promise<SaveDumpResult>;
  reset: () => void;
}

export const useConnectivityStore = create<ConnectivityState>((set, get) => ({
  tripped: false,
  running: false,
  probing: false,
  checks: [],
  main: null,
  failures: [],
  lastRunAt: undefined,
  lastSavedDumpPath: null,

  recordFailure: (entry) => {
    if (isPlaybackPath(entry.path)) return;
    const at = Date.now();
    const failures = [...get().failures, { ...entry, at }].slice(-MAX_FAILURES);
    const recent = failures.filter((f) => at - f.at <= TRIP_WINDOW_MS).length;
    set({ failures });
    if (recent >= TRIP_COUNT) get().goOffline();
  },

  recordSuccess: () => {
    if (get().tripped || get().failures.length > 0) set({ tripped: false, failures: [] });
  },

  goOffline: () => {
    if (get().tripped) return;
    set({ tripped: true });
    scheduleRecoveryProbe();
  },

  probe: async () => {
    if (get().probing) return;
    set({ probing: true });
    try {
      if (await probeApi()) get().recordSuccess();
    } finally {
      set({ probing: false });
    }
  },

  runDiagnostics: async () => {
    if (get().running) return;
    set({ running: true });
    try {
      const { checks, main } = await runAllChecks();
      set({ checks, main, lastRunAt: Date.now() });
      const apiOk = checks.some((c) => c.id === "api" && c.status === "ok");
      if (apiOk && get().tripped) {
        set({ tripped: false, failures: [] });
      }
    } finally {
      set({ running: false });
    }
  },

  retry: async () => {
    await get().runDiagnostics();
    const apiOk = get().checks.some((c) => c.id === "api" && c.status === "ok");
    if (apiOk) set({ tripped: false, failures: [] });
  },

  // manual trigger from settings: runs every probe and saves the dump file straight away
  runAndSaveDump: async () => {
    await get().runDiagnostics();
    const state = get();
    try {
      const result = await downloadDump(
        buildOfflineDump({
          checks: state.checks,
          failures: state.failures,
          main: state.main,
          endpoints: DIAG_ENDPOINTS,
        }),
      );
      if (result.filePath) {
        set({ lastSavedDumpPath: result.filePath });
      }
      return result;
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  reset: () => {
    set({
      tripped: false,
      failures: [],
    });
  },
}));

let recoveryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRecoveryProbe(): void {
  if (recoveryTimer) clearTimeout(recoveryTimer);
  recoveryTimer = setTimeout(async () => {
    recoveryTimer = null;
    const store = useConnectivityStore.getState();
    if (!store.tripped) return;
    await store.probe();
    if (useConnectivityStore.getState().tripped) scheduleRecoveryProbe();
  }, RECOVERY_PROBE_MS);
}

if (typeof window !== "undefined") {
  // the OS knows about a lost network before any request times out
  window.addEventListener("offline", () => useConnectivityStore.getState().goOffline());
  window.addEventListener("online", () => void useConnectivityStore.getState().probe());
}

/** True while the offline banner is up or the OS reports no network, when per-request error toasts would only repeat it. */
export function isConnectivityOffline(): boolean {
  return useConnectivityStore.getState().tripped || (typeof navigator !== "undefined" && navigator.onLine === false);
}

/** Calls `listener` each time the offline banner clears, so screens that failed offline can refetch. */
export function onConnectivityRestored(listener: () => void): () => void {
  return useConnectivityStore.subscribe((state, prev) => {
    if (prev.tripped && !state.tripped) listener();
  });
}

export function recordConnectivitySuccess(): void {
  useConnectivityStore.getState().recordSuccess();
}

export function recordConnectivityFailure(entry: Omit<FailureEntry, "at">): void {
  if (isPlaybackPath(entry.path)) return;
  try {
    useConnectivityStore.getState().recordFailure(entry);
  } catch {
  }
}
