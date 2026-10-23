import { describe, it, expect, beforeEach } from "vitest";
import { useSearchSourceStore } from "./searchSourceStore";

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
});
