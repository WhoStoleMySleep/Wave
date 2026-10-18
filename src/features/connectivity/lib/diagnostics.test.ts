import { afterEach, describe, expect, it, vi } from "vitest";
import type { MainNetResult } from "@/platform/native";
import { probeApi, runAllChecks } from "./diagnostics";

const machine: MainNetResult = {
  dns: [
    { host: "wave.wms", ok: true, addresses: ["1.2.3.4"], ms: 3 },
    { host: "wave.wms", ok: false, resolvers: ["8.8.8.8"], ms: 4 },
  ],
  tcp: [{ host: "wave.wms", port: 443, ok: false, error: "refused", ms: 5 }],
  tls: [{ host: "wave.wms", ok: true, protocol: "TLSv1.3", subject: "wave.wms", authorized: false, ms: 6 }],
  controls: [{ name: "google", ok: true, status: 204, ms: 7 }],
  trace: { host: "wave.wms", ok: false, hops: [], ms: 8, error: "traceroute not installed" },
  platform: "darwin arm64",
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as { waveNative?: unknown }).waveNative;
});

describe("probeApi", () => {
  it("is true only for a healthy answer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    expect(await probeApi()).toBe(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    expect(await probeApi()).toBe(false);
  });

  it("is false when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("TypeError: Load failed")));
    expect(await probeApi()).toBe(false);
  });
});

describe("runAllChecks", () => {
  it("describes every machine probe", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    (window as { waveNative?: unknown }).waveNative = { diagnoseNetwork: vi.fn().mockResolvedValue(machine) };
    const { checks, main } = await runAllChecks();
    expect(main).toBe(machine);
    expect(checks.map((check) => [check.id, check.status, check.detail])).toEqual([
      ["device", "ok", "online"],
      ["api", "ok", "HTTP 200"],
      ["dns", "ok", "1.2.3.4"],
      ["dns", "fail", "via 8.8.8.8"],
      ["tcp", "fail", "refused"],
      ["tls", "ok", "TLSv1.3 · wave.wms · untrusted"],
      ["control", "ok", "HTTP 204"],
      ["trace", "skip", "traceroute not installed"],
      ["platform", "skip", "darwin arm64"],
    ]);
  });

  it("skips the machine probes without the desktop bridge", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const { checks } = await runAllChecks();
    expect(checks.slice(1)).toEqual([
      { id: "api", status: "fail", detail: "offline" },
      { id: "main", status: "skip", detail: "desktop bridge unavailable" },
    ]);
  });

  it("reports a bridge that throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    (window as { waveNative?: unknown }).waveNative = { diagnoseNetwork: vi.fn().mockRejectedValue(new Error("denied")) };
    expect((await runAllChecks()).checks.at(-1)).toEqual({ id: "main", status: "fail", detail: "denied" });
  });
});
