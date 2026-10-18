import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type CatalogTrack, type ImportJob } from "@/shared/api";
import { showToast } from "@/shared/ui";
import { notifyLibraryChanged } from "../hooks/usePlaylists";
import { reviewFinish, reviewItemsFor, useImportStore } from "./importStore";
import { useModalStore } from "./modalStore";

vi.mock("@/shared/api", () => ({
  api: {
    createPlaylistImport: vi.fn(),
    getPlaylistImport: vi.fn(),
    addPlaylistTrack: vi.fn(),
  },
  getApiBaseUrl: () => "http://api.test",
}));
vi.mock("@/shared/ui", () => ({ showToast: vi.fn() }));
vi.mock("@/languages", () => ({ createTranslatorSync: () => (key: string) => key, getStoredLocale: () => "en" }));
vi.mock("../hooks/usePlaylists", () => ({ notifyLibraryChanged: vi.fn() }));

class FakeSocket {
  static last: FakeSocket | null = null;
  url: string;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  close = vi.fn();

  constructor(url: URL) {
    this.url = url.toString();
    FakeSocket.last = this;
  }

  send(message: object) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

const job: ImportJob = {
  id: "job-1",
  source: "spotify",
  sourceUrl: "https://open.spotify.com/playlist/1",
  title: "Road trip",
  description: "summer",
  status: "running",
  requiresDecision: false,
  result: { total: 10, imported: 0, skipped: 0 },
  importToken: "token-1",
  createdAt: "2026-01-01T00:00:00Z",
};

const track = { id: "t1", title: "Song" } as CatalogTrack;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("WebSocket", FakeSocket);
  FakeSocket.last = null;
  useImportStore.getState().reset();
  useModalStore.setState({ importReviewOpen: false, importReviewJobId: null });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("startImport", () => {
  it("listens to the import socket with the job token", async () => {
    vi.mocked(api.createPlaylistImport).mockResolvedValue(job);
    await useImportStore.getState().startImport("https://open.spotify.com/playlist/1");
    expect(FakeSocket.last?.url).toBe("ws://api.test/v1/imports/ws?token=token-1");
    expect(useImportStore.getState()).toMatchObject({ job, isPolling: true });
  });

  it("finishes direct imports at once", async () => {
    vi.mocked(api.createPlaylistImport).mockResolvedValue({ ...job, status: "completed", playlistId: "p1" });
    await useImportStore.getState().startImport("https://soundcloud.com/x");
    expect(FakeSocket.last).toBeNull();
    expect(useImportStore.getState().isPolling).toBe(false);
    expect(notifyLibraryChanged).toHaveBeenCalledOnce();
  });

  it("reports a missing worker", async () => {
    vi.mocked(api.createPlaylistImport).mockResolvedValue({ ...job, importToken: undefined });
    await useImportStore.getState().startImport("url");
    expect(useImportStore.getState()).toMatchObject({ job: null, isPolling: false, error: "Import worker unavailable" });
  });

  it("rethrows a failed start", async () => {
    vi.mocked(api.createPlaylistImport).mockRejectedValue(new Error("down"));
    await expect(useImportStore.getState().startImport("url")).rejects.toThrow("down");
    expect(useImportStore.getState()).toMatchObject({ isPolling: false, error: "Failed to start import" });
  });
});

describe("socket updates", () => {
  beforeEach(async () => {
    vi.mocked(api.createPlaylistImport).mockResolvedValue(job);
    await useImportStore.getState().startImport("url");
  });

  it("opens the review and keeps the matched tracks for the decision", () => {
    FakeSocket.last?.send({ type: "job", status: "awaiting_decision", reviewItems: [{ id: "r1" }], approvedTracks: [track] });
    expect(useModalStore.getState()).toMatchObject({ importReviewOpen: true, importReviewJobId: "job-1" });
    expect(reviewItemsFor("job-1")).toEqual([{ id: "r1" }]);
    expect(reviewFinish("job-1", [{ id: "t2" } as CatalogTrack])).toEqual({
      tracks: [track, { id: "t2" }],
      title: "Road trip",
      description: "summer",
    });
    expect(useImportStore.getState().isPolling).toBe(false);
  });

  it("does not report a settled job as disconnected", () => {
    const socket = FakeSocket.last;
    socket?.send({ type: "job", status: "failed", error: { code: "E", message: "No tracks" } });
    expect(socket?.onclose).toBeNull();
    expect(useImportStore.getState()).toMatchObject({ error: "No tracks", job: { status: "failed" } });
  });

  it("marks the job failed when the socket drops", () => {
    FakeSocket.last?.onclose?.();
    expect(useImportStore.getState()).toMatchObject({ isPolling: false, job: { status: "failed", error: { code: "DISCONNECTED" } } });
  });

  it("waits for the playlist id of a completed job", async () => {
    vi.useFakeTimers();
    vi.mocked(api.getPlaylistImport)
      .mockResolvedValueOnce({ ...job, status: "completed" })
      .mockResolvedValueOnce({ ...job, status: "completed", playlistId: "p1" });
    FakeSocket.last?.send({ type: "job", status: "completed" });
    await vi.advanceTimersByTimeAsync(800);
    expect(useImportStore.getState().job?.playlistId).toBe("p1");
    expect(notifyLibraryChanged).toHaveBeenCalledOnce();
  });
});

describe("pending track", () => {
  it("is added once the import has a playlist", async () => {
    vi.mocked(api.createPlaylistImport).mockResolvedValue({ ...job, status: "completed", playlistId: "p1" });
    vi.mocked(api.addPlaylistTrack).mockResolvedValue(undefined as never);
    await useImportStore.getState().startImport("url", { id: "t9", title: "Pending", artists: "", coverUrl: "" });
    await vi.waitFor(() => expect(showToast).toHaveBeenCalledWith("common.added_to_playlist", "checkmark", { description: "Pending" }));
    expect(api.addPlaylistTrack).toHaveBeenCalledOnce();
    expect(useImportStore.getState().pendingTrack).toBeNull();
  });
});

describe("finishReview", () => {
  it("clears the review once the import is done", async () => {
    useImportStore.setState({ job, reviewItems: [], approvedTracks: [track] });
    vi.mocked(api.getPlaylistImport).mockResolvedValue({ ...job, status: "completed", playlistId: "p1" });
    expect(await useImportStore.getState().finishReview("job-1", false)).toBe(true);
    expect(useImportStore.getState()).toMatchObject({ approvedTracks: null, isPolling: false });
  });

  it("polls until a finalizing import completes", async () => {
    vi.useFakeTimers();
    vi.mocked(api.getPlaylistImport)
      .mockResolvedValueOnce({ ...job, status: "finalizing" })
      .mockResolvedValueOnce({ ...job, status: "finalizing" })
      .mockResolvedValueOnce({ ...job, status: "completed", playlistId: "p1" });
    expect(await useImportStore.getState().finishReview("job-1", false)).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(useImportStore.getState()).toMatchObject({ isPolling: false, job: { status: "completed" } });
  });

  it("stops polling after a reset", async () => {
    vi.useFakeTimers();
    vi.mocked(api.getPlaylistImport).mockResolvedValue({ ...job, status: "finalizing" });
    await useImportStore.getState().finishReview("job-1", false);
    useImportStore.getState().reset();
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.getPlaylistImport).toHaveBeenCalledTimes(2);
  });
});

describe("reviewFinish", () => {
  it("ignores matched tracks of another job", () => {
    useImportStore.setState({ job, approvedTracks: [track] });
    expect(reviewFinish("job-2").tracks).toEqual([]);
  });
});
