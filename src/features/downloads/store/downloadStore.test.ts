import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api } from "@/shared/api";
import { waveDb } from "@/shared/storage";
import type { Track } from "@/shared/types";
import { useDownloadStore } from "./downloadStore";

const makeTrack = (id: string): Track => ({
  id,
  title: `Track ${id}`,
  artists: "Artist",
  durationMs: 100_000,
  coverUrl: "",
  playCount: 0,
});

async function waitForIdle() {
  await vi.waitFor(() => {
    const { statuses } = useDownloadStore.getState();
    const busy = Object.values(statuses).some((s) => s === "queued" || s === "downloading");
    if (busy) throw new Error("still downloading");
  });
}

describe("downloadStore", () => {
  beforeEach(async () => {
    await waveDb.clearAll();
    useDownloadStore.setState({ records: {}, statuses: {}, progress: {} });
    vi.spyOn(api, "streamLyrics").mockImplementation(async function* () {});
    vi.spyOn(api, "createPlaybackSession").mockResolvedValue({
      sessionId: "pb",
      trackId: "x",
      transport: "proxy",
      playbackId: "pb",
      streamUrl: "/v1/playback/pb/media",
      mimeType: "audio/webm",
      codec: "opus",
      bitrate: 128000,
      expiresAt: new Date().toISOString(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("downloads audio, pins it and persists the record", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 206,
        headers: { "content-type": "audio/webm", "content-length": "4" },
      }),
    );

    useDownloadStore.getState().download([makeTrack("a"), makeTrack("b"), makeTrack("c")]);
    await waitForIdle();

    const { records } = useDownloadStore.getState();
    expect(Object.keys(records).sort()).toEqual(["a", "b", "c"]);
    expect((await waveDb.getAudio("a"))?.byteSize).toBe(4);
    expect(await waveDb.getDownloadIds()).toEqual(new Set(["a", "b", "c"]));
  });

  it("pins already cached audio without fetching it again", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await waveDb.putAudio("cached", new Blob(["abc"]), { mimeType: "audio/webm" });

    useDownloadStore.getState().download([makeTrack("cached")]);
    await waitForIdle();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(useDownloadStore.getState().records.cached).toBeDefined();
  });

  it("marks failed downloads and removes downloads with their audio", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(null, { status: 500 }));

    useDownloadStore.getState().download([makeTrack("bad")]);
    await waitForIdle();
    expect(useDownloadStore.getState().statuses.bad).toBe("error");

    await waveDb.putAudio("kept", new Blob(["abc"]), { mimeType: "audio/webm" });
    useDownloadStore.getState().download([makeTrack("kept")]);
    await waitForIdle();

    await useDownloadStore.getState().remove(["kept"]);
    expect(useDownloadStore.getState().records.kept).toBeUndefined();
    expect(await waveDb.hasAudio("kept")).toBe(false);
    expect((await waveDb.getDownloadIds()).size).toBe(0);
  });
});
