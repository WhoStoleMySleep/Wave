import { describe, expect, it, vi } from "vitest";
import { buildOfflineDump, downloadDump, dumpFilename } from "./dump";

describe("buildOfflineDump", () => {
  it("packs checks, failures and machine results without secrets", () => {
    const dump = buildOfflineDump({
      checks: [
        { id: "device", status: "ok", detail: "online" },
        { id: "dns", host: "wave.wms", status: "ok", detail: "1.2.3.4", latencyMs: 12 },
      ],
      failures: [{ at: 123, method: "GET", path: "/v1/me", status: 0, latencyMs: 5 }],
      main: {
        dns: [],
        tcp: [],
        tls: [],
        controls: [],
        trace: { host: "wave.wms", ok: true, hops: ["1  1.2.3.4  1ms"], ms: 900 },
        platform: "linux x64",
      },
      endpoints: { api: "https://wave.wms" },
    });
    expect(dump.summary).toEqual({ ok: 2, fail: 0, total: 2 });
    expect(dump.failures).toHaveLength(1);
    expect(dump.machine?.trace?.hops).toHaveLength(1);
    expect(JSON.stringify(dump)).not.toMatch(/bearer|token|authorization|proxy/i);
    expect(dumpFilename(dump)).toMatch(/^wave-offline-dump-.*\.json$/);
  });

  it("calls native saveDump when available", async () => {
    const dump = buildOfflineDump({
      checks: [],
      failures: [],
      main: null,
      endpoints: { api: "https://wave.wms" },
    });

    const mockSaveDump = vi.fn().mockResolvedValue({
      success: true,
      filePath: "/home/user/Desktop/test-dump.json",
    });

    (window as any).waveNative = {
      saveDump: mockSaveDump,
    };

    const result = await downloadDump(dump);

    expect(mockSaveDump).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.filePath).toBe("/home/user/Desktop/test-dump.json");

    delete (window as any).waveNative;
  });

  it("leaves skipped checks out of both counts", () => {
    const dump = buildOfflineDump({
      checks: [
        { id: "device", status: "ok" },
        { id: "api", status: "fail" },
        { id: "main", status: "skip" },
      ],
      failures: [],
      main: null,
      endpoints: { api: "https://wave.wms" },
    });
    expect(dump.summary).toEqual({ ok: 1, fail: 1, total: 3 });
  });

  it("reports a native save that throws", async () => {
    (window as any).waveNative = { saveDump: vi.fn().mockRejectedValue(new Error("disk full")) };
    const dump = buildOfflineDump({ checks: [], failures: [], main: null, endpoints: { api: "https://wave.wms" } });
    expect(await downloadDump(dump)).toEqual({ success: false, error: "Error: disk full" });
    delete (window as any).waveNative;
  });
});
