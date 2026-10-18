import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAuthSession } from "@/shared/api";
import { readLibrarySnapshot, writeLibrarySnapshot } from "./librarySnapshot";
import { LibraryResource } from "./libraryResource";

vi.mock("@/shared/api", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/features/connectivity/store/connectivityStore", () => ({ onConnectivityRestored: vi.fn() }));
vi.mock("./librarySnapshot", () => ({ readLibrarySnapshot: vi.fn(), writeLibrarySnapshot: vi.fn() }));

const EMPTY: string[] = [];

function resource(fetch: () => Promise<string[]>, present?: (data: string[]) => string[]) {
  return new LibraryResource({ snapshotKey: "test", empty: EMPTY, fetch, isEmpty: (data) => data.length === 0, present });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuthSession).mockReturnValue({ accessToken: "token" } as ReturnType<typeof getAuthSession>);
  vi.mocked(readLibrarySnapshot).mockResolvedValue(null);
});

describe("LibraryResource", () => {
  it("shows the saved snapshot, then the fresh data", async () => {
    vi.mocked(readLibrarySnapshot).mockResolvedValue(["saved"]);
    let finish: (data: string[]) => void = () => {};
    const list = resource(() => new Promise((resolve) => (finish = resolve)));
    const loading = list.load();
    await vi.waitFor(() => expect(list.getView()).toMatchObject({ data: ["saved"], isLoading: false }));
    finish(["fresh"]);
    await loading;
    expect(list.getView().data).toEqual(["fresh"]);
    expect(writeLibrarySnapshot).toHaveBeenCalledWith("test", ["fresh"]);
  });

  it("loads once until forced", async () => {
    const fetch = vi.fn().mockResolvedValue(["a"]);
    const list = resource(fetch);
    await list.load();
    await list.load();
    await list.load(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("shares a load already in flight", async () => {
    const fetch = vi.fn().mockResolvedValue(["a"]);
    const list = resource(fetch);
    await Promise.all([list.load(), list.load()]);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("reports a failure only when there is nothing to show", async () => {
    const failure = new Error("offline");
    const list = resource(() => Promise.reject(failure));
    await list.load();
    expect(list.getView()).toMatchObject({ data: [], error: failure, isLoading: false });

    vi.mocked(readLibrarySnapshot).mockResolvedValue(["saved"]);
    const saved = resource(() => Promise.reject(failure));
    await saved.load();
    expect(saved.getView()).toMatchObject({ data: ["saved"], error: undefined });
  });

  it("clears the data when signed out", async () => {
    const list = resource(() => Promise.resolve(["a"]));
    await list.load();
    vi.mocked(getAuthSession).mockReturnValue(null);
    await list.load(true);
    expect(list.getView().data).toEqual([]);
  });

  it("presents the data through the overlay and saves updates", async () => {
    const list = resource(() => Promise.resolve(["a"]), (data) => [...data, "overlay"]);
    await list.load();
    list.update((data) => [...data, "b"]);
    expect(list.getView().data).toEqual(["a", "b", "overlay"]);
    expect(writeLibrarySnapshot).toHaveBeenLastCalledWith("test", ["a", "b"]);
  });

  it("notifies subscribers until they leave", async () => {
    const list = resource(() => Promise.resolve(["a"]));
    const listener = vi.fn();
    const leave = list.subscribe(listener);
    list.publish();
    leave();
    list.publish();
    expect(listener).toHaveBeenCalledOnce();
  });
});
