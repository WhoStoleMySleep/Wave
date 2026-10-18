import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api } from "@/shared/api";
import { searchFor, useSearch, type SearchKind, type SearchResult } from "./useSearch";

vi.mock("@/shared/api", () => ({
  api: { search: vi.fn() },
  toClientTrack: (track: { id: string; title: string }) => ({ id: track.id, title: track.title, client: true }),
}));

const search = vi.mocked(api.search);
const DEBOUNCE_MS = 320;

function answer(items: unknown[]) {
  return Promise.resolve({ items } as Awaited<ReturnType<typeof api.search>>);
}

describe("useSearch", () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: SearchResult<unknown>;

  function Probe({ query, kind, enabled = true }: { query: string; kind: SearchKind; enabled?: boolean }) {
    latest = useSearch(query, kind, { enabled }) as SearchResult<unknown>;
    return null;
  }

  async function render(query: string, kind: SearchKind = "artist", enabled = true) {
    await act(async () => root.render(<Probe query={query} kind={kind} enabled={enabled} />));
  }

  async function wait(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    search.mockReset();
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("does not search for fewer than two characters", async () => {
    await render("a");
    await wait(DEBOUNCE_MS);
    expect(search).not.toHaveBeenCalled();
    expect(latest).toMatchObject({ items: [], loading: false, hasLoaded: false });
  });

  it("waits for a pause in typing and shows loading meanwhile", async () => {
    search.mockReturnValue(answer([{ type: "artist", id: "1" }]));
    await render("mu");
    await render("mus");
    expect(latest.loading).toBe(true);
    await wait(DEBOUNCE_MS);

    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("mus", "artist");
    expect(latest).toMatchObject({ items: [{ type: "artist", id: "1" }], loading: false, hasLoaded: true });
  });

  it("keeps only items of the requested kind", async () => {
    search.mockReturnValue(answer([{ type: "album", id: "a" }, { type: "artist", id: "b" }]));
    await render("query");
    await wait(DEBOUNCE_MS);
    expect(latest.items).toEqual([{ type: "artist", id: "b" }]);
  });

  it("drops the answer for a query the user already left", async () => {
    let finishSlow: (value: Awaited<ReturnType<typeof api.search>>) => void = () => {};
    search.mockReturnValueOnce(answer([{ type: "artist", id: "ab" }]));
    search.mockReturnValueOnce(new Promise((resolve) => (finishSlow = resolve)));
    await render("ab");
    await wait(DEBOUNCE_MS);
    await render("abc");
    await wait(DEBOUNCE_MS);

    await render("ab");
    await act(async () => finishSlow({ items: [{ type: "artist", id: "abc" }] } as Awaited<ReturnType<typeof api.search>>));

    expect(latest).toMatchObject({ items: [{ type: "artist", id: "ab" }], loading: false });
  });

  it("does not search again for the query it already has", async () => {
    search.mockReturnValue(answer([{ type: "artist", id: "1" }]));
    await render("muse");
    await wait(DEBOUNCE_MS);
    await render("muse", "artist", false);
    await render("muse", "artist", true);
    await wait(DEBOUNCE_MS);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("reports a failed search as an error with no results", async () => {
    search.mockRejectedValue(new Error("offline"));
    await render("muse");
    await wait(DEBOUNCE_MS);
    expect(latest.error?.message).toBe("offline");
    expect(latest).toMatchObject({ items: [], hasLoaded: true, loading: false });
  });

  it("searches at once on runNow", async () => {
    search.mockReturnValue(answer([]));
    await render("muse");
    await act(async () => latest.runNow());
    expect(search).toHaveBeenCalledTimes(1);
  });
});

describe("searchFor", () => {
  it("converts tracks into client tracks", async () => {
    search.mockReturnValue(answer([{ type: "track", id: "t", title: "T" }, { type: "artist", id: "a" }]));
    expect(await searchFor("track", "x")).toEqual([{ id: "t", title: "T", client: true }]);
  });
});
