import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/shared/api";
import { applyOptimisticLike } from "./useLikedTracks";
import { evictPlaylistFromCache, notifyLibraryChanged } from "./usePlaylists";
import { likeTrack, toggleTrackLike, unlikeTrack, useRemoveExternalItem, useSaveExternalItem } from "./useLibraryMutations";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/shared/api", () => ({
  api: {
    likeTrack: vi.fn(),
    unlikeTrack: vi.fn(),
    saveCollection: vi.fn(),
    removeCollection: vi.fn(),
    deletePlaylist: vi.fn(),
  },
}));
vi.mock("./usePlaylists", () => ({ notifyLibraryChanged: vi.fn(), evictPlaylistFromCache: vi.fn() }));
vi.mock("./useLikedTracks", () => ({ applyOptimisticLike: vi.fn(), isTrackLiked: vi.fn(() => false) }));

let container: HTMLDivElement;
let root: Root;

function renderHook<T>(hook: () => T): { current: T } {
  const result = {} as { current: T };
  function Probe() {
    result.current = hook();
    return null;
  }
  act(() => root.render(<Probe />));
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => act(() => root.unmount()));

describe("likeTrack", () => {
  it("likes optimistically and refreshes the library", async () => {
    vi.mocked(api.likeTrack).mockResolvedValue(undefined as never);
    await likeTrack("t1");
    expect(applyOptimisticLike).toHaveBeenCalledWith("t1", true);
    expect(notifyLibraryChanged).toHaveBeenCalledOnce();
  });

  it("rolls back a failed unlike", async () => {
    const rollback = vi.fn();
    vi.mocked(applyOptimisticLike).mockReturnValue(rollback);
    vi.mocked(api.unlikeTrack).mockRejectedValue(new Error("offline"));
    await expect(unlikeTrack("t1")).rejects.toThrow("offline");
    expect(applyOptimisticLike).toHaveBeenCalledWith("t1", false);
    expect(rollback).toHaveBeenCalledOnce();
    expect(notifyLibraryChanged).not.toHaveBeenCalled();
  });
});

describe("useSaveExternalItem", () => {
  it("passes the result and settles", async () => {
    vi.mocked(api.saveCollection).mockResolvedValue();
    const hook = renderHook(useSaveExternalItem);
    const callbacks = { onSuccess: vi.fn(), onSettled: vi.fn(), onError: vi.fn() };
    await act(async () => hook.current.mutate({ type: "album", id: "a1" }, callbacks));
    expect(api.saveCollection).toHaveBeenCalledWith("albums", "a1");
    expect(callbacks.onSuccess).toHaveBeenCalledOnce();
    expect(callbacks.onSettled).toHaveBeenCalledOnce();
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(notifyLibraryChanged).toHaveBeenCalledOnce();
    expect(hook.current.isPending).toBe(false);
  });

  it("hands a failure to onError", async () => {
    const failure = new Error("nope");
    vi.mocked(api.saveCollection).mockRejectedValue(failure);
    const hook = renderHook(useSaveExternalItem);
    const onError = vi.fn();
    await act(async () => hook.current.mutate({ type: "artist", id: "a1" }, { onError }));
    expect(onError).toHaveBeenCalledWith(failure);
  });
});

describe("useRemoveExternalItem", () => {
  it("deletes an owned playlist and its saved copy", async () => {
    vi.mocked(api.deletePlaylist).mockResolvedValue(undefined as never);
    vi.mocked(api.removeCollection).mockResolvedValue();
    const hook = renderHook(useRemoveExternalItem);
    await act(() => hook.current.mutateAsync({ type: "playlist", id: "p1", isOwned: true }));
    expect(evictPlaylistFromCache).toHaveBeenCalledWith("p1");
    expect(api.removeCollection).toHaveBeenCalledWith("playlists", "p1");
  });

  it("falls back to unsaving a playlist it could not delete", async () => {
    vi.mocked(api.deletePlaylist).mockRejectedValue(new Error("forbidden"));
    vi.mocked(api.removeCollection).mockResolvedValue();
    const hook = renderHook(useRemoveExternalItem);
    await act(() => hook.current.mutateAsync({ type: "playlist", id: "p1" }));
    expect(api.removeCollection).toHaveBeenCalledWith("playlists", "p1");
  });

  it("keeps the failure for an owned playlist", async () => {
    vi.mocked(api.deletePlaylist).mockRejectedValue(new Error("forbidden"));
    const hook = renderHook(useRemoveExternalItem);
    await expect(act(() => hook.current.mutateAsync({ type: "playlist", id: "p1", isOwned: true }))).rejects.toThrow("forbidden");
    expect(api.removeCollection).not.toHaveBeenCalled();
  });

  it("unsaves albums without touching playlists", async () => {
    vi.mocked(api.removeCollection).mockResolvedValue();
    const hook = renderHook(useRemoveExternalItem);
    await act(() => hook.current.mutateAsync({ type: "album", id: "a1" }));
    expect(api.removeCollection).toHaveBeenCalledWith("albums", "a1");
    expect(evictPlaylistFromCache).not.toHaveBeenCalled();
  });
});

describe("toggleTrackLike", () => {
  it("drops a second tap while the first is in flight", async () => {
    let finish: () => void = () => {};
    vi.mocked(api.likeTrack).mockReturnValue(new Promise((resolve) => (finish = () => resolve(undefined as never))));
    const first = toggleTrackLike("t1");
    await toggleTrackLike("t1");
    finish();
    await first;
    expect(api.likeTrack).toHaveBeenCalledOnce();
  });

  it("logs a failed toggle instead of throwing", async () => {
    vi.mocked(applyOptimisticLike).mockReturnValue(() => {});
    vi.mocked(api.likeTrack).mockRejectedValue(new Error("offline"));
    await expect(toggleTrackLike("t2")).resolves.toBeUndefined();
  });
});
