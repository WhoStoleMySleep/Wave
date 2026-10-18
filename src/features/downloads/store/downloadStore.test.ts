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

function okAudio(): Response {
  return new Response(new Uint8Array([1, 2, 3, 4]), {
    status: 206,
    headers: { "content-type": "audio/webm", "content-length": "4" },
  });
}

/** A stream request that never answers until its download is aborted, like fetch it fails at once on a spent signal. */
function hangingFetch(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const abort = () => reject(new DOMException("aborted", "AbortError"));
    if (init?.signal?.aborted) abort();
    init?.signal?.addEventListener("abort", abort);
  });
}

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
    localStorage.clear();
    useDownloadStore.setState({ records: {}, statuses: {}, progress: {}, autoCollections: [] });
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

  it("cancels queued and running downloads but keeps finished ones", async () => {
    await waveDb.putAudio("done", new Blob(["abc"]), { mimeType: "audio/webm" });
    useDownloadStore.getState().download([makeTrack("done")]);
    await waitForIdle();
    vi.spyOn(globalThis, "fetch").mockImplementation(hangingFetch);

    useDownloadStore.getState().download([makeTrack("a"), makeTrack("b"), makeTrack("c")]);
    await vi.waitFor(() => expect(useDownloadStore.getState().statuses.a).toBe("downloading"));
    useDownloadStore.getState().cancel(["done", "a", "b", "c"]);
    await waitForIdle();

    const { records, statuses } = useDownloadStore.getState();
    expect(Object.keys(records)).toEqual(["done"]);
    expect(statuses).toEqual({});
    expect(await waveDb.getDownloadIds()).toEqual(new Set(["done"]));
  });

  it("downloads tracks added to a followed collection and remembers it", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => okAudio());

    useDownloadStore.getState().followCollection("p1", [makeTrack("a")]);
    await waitForIdle();
    await useDownloadStore.getState().syncCollection("p1", [makeTrack("a"), makeTrack("b")]);
    await waitForIdle();

    expect(Object.keys(useDownloadStore.getState().records).sort()).toEqual(["a", "b"]);
    expect(JSON.parse(localStorage.getItem("wave_auto_download_collections") ?? "[]")).toEqual(["p1"]);
  });

  it("leaves collections that are not followed and failed tracks alone on sync", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(null, { status: 500 }));

    await useDownloadStore.getState().syncCollection("other", [makeTrack("x")]);
    expect(fetchSpy).not.toHaveBeenCalled();

    useDownloadStore.getState().followCollection("p1", [makeTrack("bad")]);
    await waitForIdle();
    fetchSpy.mockClear();
    await useDownloadStore.getState().syncCollection("p1", [makeTrack("bad")]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(useDownloadStore.getState().statuses.bad).toBe("error");
  });

  it("stops following and cancels the collection's pending tracks on unfollow", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(hangingFetch);
    const tracks = [makeTrack("a"), makeTrack("b"), makeTrack("c")];

    useDownloadStore.getState().followCollection("p1", tracks);
    await vi.waitFor(() => expect(useDownloadStore.getState().statuses.a).toBe("downloading"));
    useDownloadStore.getState().unfollowCollection("p1", tracks);
    await waitForIdle();

    expect(useDownloadStore.getState().autoCollections).toEqual([]);
    expect(useDownloadStore.getState().statuses).toEqual({});
    await useDownloadStore.getState().syncCollection("p1", [makeTrack("d")]);
    expect(useDownloadStore.getState().statuses.d).toBeUndefined();
  });
});
