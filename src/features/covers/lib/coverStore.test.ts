import { beforeEach, describe, expect, it, vi } from "vitest";
import { waveDb } from "@/shared/storage";
import { loadSavedCover, saveCover } from "./coverStore";

vi.mock("@/shared/storage", () => ({
  waveDb: { hasCover: vi.fn(), putCover: vi.fn(), getCover: vi.fn(), trimCovers: vi.fn() },
}));

function respond(blob: Blob, ok = true) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, blob: async () => blob }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(waveDb.hasCover).mockResolvedValue(false);
});

describe("saveCover", () => {
  it("keeps an image thumbnail", async () => {
    const blob = new Blob(["x"], { type: "image/jpeg" });
    respond(blob);
    await saveCover("https://cdn.test/1.jpg");
    expect(waveDb.putCover).toHaveBeenCalledWith("https://cdn.test/1.jpg", blob);
  });

  it("skips local URLs and non-images", async () => {
    respond(new Blob(["<html>"], { type: "text/html" }));
    await saveCover("blob:local");
    await saveCover("https://cdn.test/2.jpg");
    expect(waveDb.putCover).not.toHaveBeenCalled();
  });

  it("tries again after a failed save", async () => {
    respond(new Blob(["x"], { type: "image/jpeg" }), false);
    await saveCover("https://cdn.test/3.jpg");
    respond(new Blob(["x"], { type: "image/jpeg" }));
    await saveCover("https://cdn.test/3.jpg");
    expect(waveDb.putCover).toHaveBeenCalledOnce();
  });
});

describe("loadSavedCover", () => {
  it("asks storage again after a miss", async () => {
    vi.mocked(waveDb.getCover).mockResolvedValue(null);
    expect(await loadSavedCover("https://cdn.test/4.jpg")).toBeNull();
    await loadSavedCover("https://cdn.test/4.jpg");
    expect(waveDb.getCover).toHaveBeenCalledTimes(2);
  });

  it("reuses the object URL of a saved copy", async () => {
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:5") }));
    vi.mocked(waveDb.getCover).mockResolvedValue({ blob: new Blob(["x"]) } as Awaited<ReturnType<typeof waveDb.getCover>>);
    expect(await loadSavedCover("https://cdn.test/5.jpg")).toBe("blob:5");
    await loadSavedCover("https://cdn.test/5.jpg");
    expect(waveDb.getCover).toHaveBeenCalledOnce();
  });
});
