import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadSavedCover, saveCover } from "./coverStore";
import { clearCoverRegistry, getCoverElement, isCoverReady, markCoverReady, preloadCoverArt } from "./coverArt";

vi.mock("./coverStore", () => ({ loadSavedCover: vi.fn(), saveCover: vi.fn() }));

class FakeImage {
  static failing = new Set<string>();
  static created = 0;
  crossOrigin = "";
  decoding = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private current = "";

  constructor() {
    FakeImage.created += 1;
  }

  get src() {
    return this.current;
  }

  set src(value: string) {
    this.current = value;
    queueMicrotask(() => (FakeImage.failing.has(value) ? this.onerror?.() : this.onload?.()));
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  clearCoverRegistry();
  FakeImage.failing.clear();
  FakeImage.created = 0;
  vi.stubGlobal("Image", FakeImage);
});

describe("preloadCoverArt", () => {
  it("loads a cover once for every caller and saves it", async () => {
    await Promise.all([preloadCoverArt("https://cdn.test/a.jpg"), preloadCoverArt("https://cdn.test/a.jpg")]);
    expect(FakeImage.created).toBe(1);
    expect(isCoverReady("https://cdn.test/a.jpg")).toBe(true);
    expect(saveCover).toHaveBeenCalledWith("https://cdn.test/a.jpg", "https://cdn.test/a.jpg");
  });

  it("falls back to the saved copy and finds the image by either URL", async () => {
    FakeImage.failing.add("https://cdn.test/b.jpg");
    vi.mocked(loadSavedCover).mockResolvedValue("blob:saved-b");
    await preloadCoverArt("https://cdn.test/b.jpg");
    expect(isCoverReady("https://cdn.test/b.jpg")).toBe(true);
    expect(getCoverElement("https://cdn.test/b.jpg")?.src).toBe("blob:saved-b");
    expect(getCoverElement("blob:saved-b")).toBe(getCoverElement("https://cdn.test/b.jpg"));
  });

  it("settles as failed when neither copy loads, and retries next time", async () => {
    FakeImage.failing.add("https://cdn.test/c.jpg");
    vi.mocked(loadSavedCover).mockResolvedValue(null);
    await preloadCoverArt("https://cdn.test/c.jpg");
    expect(isCoverReady("https://cdn.test/c.jpg")).toBe(false);
    FakeImage.failing.clear();
    await preloadCoverArt("https://cdn.test/c.jpg");
    expect(isCoverReady("https://cdn.test/c.jpg")).toBe(true);
  });
});

describe("markCoverReady", () => {
  it("registers a cover an img decoded by itself", () => {
    const element = { src: "https://proxy.test/d.jpg" } as HTMLImageElement;
    markCoverReady("https://cdn.test/d.jpg", "https://proxy.test/d.jpg", element);
    expect(isCoverReady("https://cdn.test/d.jpg")).toBe(true);
    expect(getCoverElement("https://proxy.test/d.jpg")).toBe(element);
  });

  it("ignores a missing URL", () => {
    markCoverReady(undefined);
    expect(saveCover).not.toHaveBeenCalled();
  });
});
