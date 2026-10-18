import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { queryCache } from "./queryCache";
import { useCachedQuery, type CachedQuery } from "./useCachedQuery";

describe("useCachedQuery", () => {
  let root: Root;
  let latest: CachedQuery<string[]>;

  function Probe({ cacheKey, fetcher }: { cacheKey: string | null; fetcher: () => Promise<string[]> }) {
    latest = useCachedQuery(cacheKey, fetcher, { fallback: [], staleTimeMs: 60_000 });
    return null;
  }

  async function render(cacheKey: string | null, fetcher: () => Promise<string[]>) {
    await act(async () => root.render(<Probe cacheKey={cacheKey} fetcher={fetcher} />));
  }

  beforeEach(() => {
    queryCache.clear();
    root = createRoot(document.createElement("div"));
  });

  afterEach(() => act(() => root.unmount()));

  it("loads data the cache does not have yet", async () => {
    await render("k", async () => ["fresh"]);
    expect(latest).toEqual({ data: ["fresh"], isLoading: false, error: null });
  });

  it("shows a fresh cached copy without loading again", async () => {
    queryCache.set("k", ["cached"], 60_000);
    const fetcher = vi.fn(async () => ["fresh"]);
    await render("k", fetcher);
    expect(latest.data).toEqual(["cached"]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports a failure and stops loading", async () => {
    await render("k", async () => {
      throw new Error("offline");
    });
    expect(latest).toMatchObject({ data: [], isLoading: false });
    expect(latest.error?.message).toBe("offline");
  });

  it("follows updates written to the cache by others", async () => {
    await render("k", async () => ["first"]);
    await act(async () => queryCache.set("k", ["updated"]));
    expect(latest.data).toEqual(["updated"]);
  });

  it("shows the fallback without loading for a null key", async () => {
    const fetcher = vi.fn(async () => ["fresh"]);
    await render(null, fetcher);
    expect(latest).toEqual({ data: [], isLoading: false, error: null });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
