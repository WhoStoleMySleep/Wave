import { describe, it, expect, beforeEach } from "vitest";
import { SEARCH_SOURCES, useSearchSourceStore } from "./searchSourceStore";

describe("searchSourceStore", () => {
  beforeEach(() => {
    useSearchSourceStore.setState({ source: "youtube" });
  });

  it("starts with YouTube", () => {
    expect(useSearchSourceStore.getState().source).toBe("youtube");
  });

  it("keeps the catalog the user switched to", () => {
    useSearchSourceStore.getState().setSource("deezer");
    expect(useSearchSourceStore.getState().source).toBe("deezer");
  });

  it("no longer offers Spotify", () => {
    expect(SEARCH_SOURCES).not.toContain("spotify");
  });

  it("falls back to YouTube for a saved source that is gone", () => {
    const merge = useSearchSourceStore.persist.getOptions().merge!;
    const current = useSearchSourceStore.getState();
    expect(merge({ source: "spotify" }, current)).toBe(current);
    expect(merge({ source: "yandex" }, current)).toMatchObject({ source: "yandex" });
  });
});
