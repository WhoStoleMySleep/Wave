import { afterEach, describe, expect, it, vi } from "vitest";
import { waveDb } from "@/shared/storage";
import type { Track } from "@/shared/types";
import { cacheWhenReady, HeadStart, isCacheable, saveAudio } from "./audioDownload";

const track = (id: string, durationMs = 180_000): Track => ({
  id,
  title: id,
  artists: "Artist",
  durationMs,
  coverUrl: "",
  playCount: 0,
});

const session = { mimeType: "audio/webm", loudnessDb: 3 };

describe("saveAudio", () => {
  afterEach(() => vi.restoreAllMocks());

  it("stores the whole file with its loudness", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "audio/webm" } }));
    const size = await saveAudio({ track: track("saved"), url: "/media", session, signal: new AbortController().signal });
    expect(size).toBe(3);
    const stored = await waveDb.getAudio("saved");
    expect(stored?.byteSize).toBe(3);
    expect(stored?.loudnessDb).toBe(3);
  });

  it("skips a partial response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1]), { status: 206, headers: { "content-type": "audio/webm", "content-range": "bytes 0-0/10" } }),
    );
    const size = await saveAudio({ track: track("partial"), url: "/media", session, signal: new AbortController().signal });
    expect(size).toBeNull();
    expect(await waveDb.getAudio("partial")).toBeNull();
  });

  it("does not fetch once cancelled", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const controller = new AbortController();
    controller.abort();
    expect(await saveAudio({ track: track("cancelled"), url: "/media", session, signal: controller.signal })).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("isCacheable", () => {
  it("keeps tracks up to twenty minutes and tracks of unknown length", () => {
    expect(isCacheable(track("song"))).toBe(true);
    expect(isCacheable(track("edge", 20 * 60 * 1000))).toBe(true);
    expect(isCacheable(track("mix", 20 * 60 * 1000 + 1))).toBe(false);
    expect(isCacheable(track("unknown", 0))).toBe(true);
  });
});

describe("HeadStart", () => {
  afterEach(() => vi.useRealTimers());

  it("holds downloads until released", async () => {
    const headStart = new HeadStart();
    const release = headStart.hold();
    const passed = vi.fn();
    void headStart.ready.then(passed);
    await Promise.resolve();
    expect(passed).not.toHaveBeenCalled();
    release();
    await headStart.ready;
    expect(passed).toHaveBeenCalled();
  });

  it("lets downloads go after ten seconds anyway", async () => {
    vi.useFakeTimers();
    const headStart = new HeadStart();
    headStart.hold();
    vi.advanceTimersByTime(10_000);
    await expect(headStart.ready).resolves.toBeUndefined();
  });
});

describe("cacheWhenReady", () => {
  afterEach(() => vi.restoreAllMocks());

  it("saves only after downloads are let go", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([1, 2]), { status: 200, headers: { "content-type": "audio/webm" } }));
    let release = () => {};
    const ready = new Promise<void>((resolve) => (release = resolve));
    const saving = cacheWhenReady({ track: track("later"), url: "/media", session, signal: new AbortController().signal }, ready);
    await Promise.resolve();
    expect(fetchSpy).not.toHaveBeenCalled();
    release();
    await saving;
    expect((await waveDb.getAudio("later"))?.byteSize).toBe(2);
  });

  it("does not reject when the save fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const request = { track: track("broken"), url: "/media", session, signal: new AbortController().signal };
    await expect(cacheWhenReady(request, Promise.resolve())).resolves.toBeUndefined();
  });
});
