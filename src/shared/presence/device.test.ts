import { afterEach, describe, expect, it, vi } from "vitest";
import { getDeviceId, getDeviceName, getPlatform } from "./device";

describe("device", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("tells Android from Linux", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36" });
    expect(getPlatform()).toBe("android");
    expect(getDeviceName()).toBe("Android");
  });

  it("names a Mac", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" });
    expect(getDeviceName()).toBe("Mac");
  });

  it("keeps one id across launches", () => {
    const first = getDeviceId();
    expect(getDeviceId()).toBe(first);
  });
});
