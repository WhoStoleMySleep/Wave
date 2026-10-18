import { beforeEach, describe, expect, it, vi } from "vitest";
import { RECOVERY_PROBE_MS, useConnectivityStore } from "./connectivityStore";

const { probeApi } = vi.hoisted(() => ({ probeApi: vi.fn().mockResolvedValue(false) }));

vi.mock("../lib/diagnostics", () => ({
  runAllChecks: vi.fn().mockResolvedValue({ checks: [], main: null }),
  probeApi,
  DIAG_ENDPOINTS: { api: "https://wave.wms" },
}));

describe("connectivityStore trip logic", () => {
  beforeEach(() => {
    useConnectivityStore.getState().reset();
    vi.useFakeTimers();
  });

  it("goes offline on 3 failures inside a minute", () => {
    const { recordFailure } = useConnectivityStore.getState();
    recordFailure({ method: "GET", path: "/v1/me", latencyMs: 5 });
    expect(useConnectivityStore.getState().tripped).toBe(false);
    recordFailure({ method: "GET", path: "/v1/me", latencyMs: 5 });
    expect(useConnectivityStore.getState().tripped).toBe(false);
    recordFailure({ method: "GET", path: "/v1/me", latencyMs: 5 });
    const state = useConnectivityStore.getState();
    expect(state.tripped).toBe(true);
    expect(state.failures).toHaveLength(3);
  });

  it("ignores track playback and lyrics failures without tripping", () => {
    const { recordFailure } = useConnectivityStore.getState();
    recordFailure({ method: "POST", path: "/v1/tracks/trk_1/playback", latencyMs: 50 });
    recordFailure({ method: "POST", path: "/v1/tracks/trk_2/playback", latencyMs: 50 });
    recordFailure({ method: "POST", path: "/v1/tracks/trk_3/playback", latencyMs: 50 });
    recordFailure({ method: "GET", path: "/v1/tracks/trk_1/lyrics", latencyMs: 50 });
    recordFailure({ method: "GET", path: "/v1/playback/sess_123/media", latencyMs: 50 });

    const state = useConnectivityStore.getState();
    expect(state.tripped).toBe(false);
    expect(state.failures).toHaveLength(0);
  });

  it("lets old failures age out of the window", () => {
    const store = useConnectivityStore.getState();
    store.recordFailure({ method: "GET", path: "/v1/me", latencyMs: 5 });
    store.recordFailure({ method: "GET", path: "/v1/me", latencyMs: 5 });
    vi.advanceTimersByTime(61_000);
    useConnectivityStore.getState().recordFailure({ method: "GET", path: "/v1/me", latencyMs: 5 });
    useConnectivityStore.getState().recordFailure({ method: "GET", path: "/v1/me", latencyMs: 5 });
    expect(useConnectivityStore.getState().tripped).toBe(false);
  });

  it("comes back online on the next successful response", () => {
    for (let i = 0; i < 3; i++) {
      useConnectivityStore.getState().recordFailure({ method: "GET", path: "/v1/me", latencyMs: 5 });
    }
    expect(useConnectivityStore.getState().tripped).toBe(true);
    useConnectivityStore.getState().recordSuccess();
    expect(useConnectivityStore.getState().tripped).toBe(false);
    expect(useConnectivityStore.getState().failures).toHaveLength(0);
  });

  it("probes the server while offline and recovers on its own", async () => {
    probeApi.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    useConnectivityStore.getState().goOffline();

    await vi.advanceTimersByTimeAsync(RECOVERY_PROBE_MS);
    expect(useConnectivityStore.getState().tripped).toBe(true);
    await vi.advanceTimersByTimeAsync(RECOVERY_PROBE_MS);
    expect(useConnectivityStore.getState().tripped).toBe(false);
  });

  it("goes offline as soon as the OS reports it", () => {
    window.dispatchEvent(new Event("offline"));
    expect(useConnectivityStore.getState().tripped).toBe(true);
  });

  it("caps the failure log", () => {
    for (let i = 0; i < 30; i++) {
      useConnectivityStore.getState().recordFailure({ method: "GET", path: "/v1/me", latencyMs: 1 });
    }
    expect(useConnectivityStore.getState().failures.length).toBeLessThanOrEqual(20);
  });

  it("updates lastSavedDumpPath when runAndSaveDump succeeds", async () => {
    vi.useRealTimers();
    (window as any).waveNative = {
      saveDump: vi.fn().mockResolvedValue({
        success: true,
        filePath: "/home/user/Desktop/test-offline-dump.json",
      }),
    };

    const res = await useConnectivityStore.getState().runAndSaveDump();
    expect(res.success).toBe(true);
    expect(useConnectivityStore.getState().lastSavedDumpPath).toBe("/home/user/Desktop/test-offline-dump.json");

    delete (window as any).waveNative;
  });
});
