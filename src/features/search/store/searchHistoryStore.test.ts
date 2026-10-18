import { describe, it, expect, beforeEach } from "vitest";
import { useSearchHistoryStore, withHistoryItem } from "./searchHistoryStore";
import { clearSearchAndQueryCache } from "@/shared/utils/cacheManager";
import { debouncedStorage } from "@/shared/utils/storage";

describe("searchHistoryStore", () => {
  beforeEach(() => {
    useSearchHistoryStore.getState().clearHistory();
  });

  it("starts with empty history", () => {
    expect(useSearchHistoryStore.getState().items).toEqual([]);
  });

  it("adds items to the front of history", () => {
    useSearchHistoryStore.getState().addItem({
      id: "track-1",
      type: "track",
      title: "Track One",
    });

    useSearchHistoryStore.getState().clearHistory();
    useSearchHistoryStore.getState().addItem({
      id: "track-1",
      type: "track",
      title: "Track One",
    });
    useSearchHistoryStore.getState().addItem({
      id: "artist-1",
      type: "artist",
      title: "Artist One",
    });

    const items = useSearchHistoryStore.getState().items;
    expect(items.length).toBe(2);
    expect(items[0].id).toBe("artist-1");
    expect(items[1].id).toBe("track-1");
  });

  it("deduplicates and bumps existing items to the front", () => {
    useSearchHistoryStore.getState().addItem({
      id: "track-1",
      type: "track",
      title: "Track One",
    });
    useSearchHistoryStore.getState().addItem({
      id: "track-2",
      type: "track",
      title: "Track Two",
    });
    useSearchHistoryStore.getState().addItem({
      id: "track-1",
      type: "track",
      title: "Track One Updated",
    });

    const items = useSearchHistoryStore.getState().items;
    expect(items.length).toBe(2);
    expect(items[0].id).toBe("track-1");
    expect(items[0].title).toBe("Track One Updated");
    expect(items[1].id).toBe("track-2");
  });

  it("deduplicates queries case-insensitively", () => {
    useSearchHistoryStore.getState().addItem({
      id: "query:cupsize",
      type: "query",
      title: "CUPSIZE",
    });
    useSearchHistoryStore.getState().addItem({
      id: "query:cupsize",
      type: "query",
      title: "cupsize",
    });

    const items = useSearchHistoryStore.getState().items;
    expect(items.length).toBe(1);
    expect(items[0].title).toBe("cupsize");
  });

  it("removes individual items", () => {
    useSearchHistoryStore.getState().addItem({
      id: "track-1",
      type: "track",
      title: "Track One",
    });
    useSearchHistoryStore.getState().addItem({
      id: "track-2",
      type: "track",
      title: "Track Two",
    });

    useSearchHistoryStore.getState().removeItem("track-1");

    const items = useSearchHistoryStore.getState().items;
    expect(items.length).toBe(1);
    expect(items[0].id).toBe("track-2");
  });

  it("clears all items", () => {
    useSearchHistoryStore.getState().addItem({
      id: "track-1",
      type: "track",
      title: "Track One",
    });
    useSearchHistoryStore.getState().clearHistory();

    expect(useSearchHistoryStore.getState().items).toEqual([]);
  });

  it("caps at maximum 30 items", () => {
    for (let i = 0; i < 35; i++) {
      useSearchHistoryStore.getState().addItem({
        id: `track-${i}`,
        type: "track",
        title: `Track ${i}`,
      });
    }

    const items = useSearchHistoryStore.getState().items;
    expect(items.length).toBe(30);
    expect(items[0].id).toBe("track-34");
  });

  it("clears search history from both in-memory store and storage when cache is wiped", async () => {
    useSearchHistoryStore.getState().addItem({
      id: "track-1",
      type: "track",
      title: "Track One",
    });
    expect(useSearchHistoryStore.getState().items.length).toBe(1);

    await clearSearchAndQueryCache();

    expect(useSearchHistoryStore.getState().items).toEqual([]);
    expect(debouncedStorage.getItem("wave_search_history")).toBeNull();
  });

  it("keeps a query and an item with the same title apart", () => {
    const items = withHistoryItem([], { id: "query:muse", type: "query", title: "Muse" }, 1);
    const next = withHistoryItem(items, { id: "artist-muse", type: "artist", title: "Muse" }, 2);
    expect(next.map((item) => item.type)).toEqual(["artist", "query"]);
  });

  it("stamps the new entry with the given time and leaves the input list untouched", () => {
    const items = withHistoryItem([], { id: "a", type: "track", title: "A" }, 5);
    const next = withHistoryItem(items, { id: "b", type: "track", title: "B" }, 9);
    expect(items).toHaveLength(1);
    expect(next[0]).toMatchObject({ id: "b", timestamp: 9 });
  });
});
