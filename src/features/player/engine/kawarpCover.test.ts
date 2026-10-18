import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeCover, fetchCoverBitmap, releaseCover } from "./kawarpCover";

function decodedElement(): HTMLImageElement {
  const image = new Image();
  Object.defineProperty(image, "complete", { value: true });
  Object.defineProperty(image, "naturalWidth", { value: 300 });
  return image;
}

class LoadingImage {
  public crossOrigin = "";
  public onload: (() => void) | null = null;
  public onerror: (() => void) | null = null;

  constructor(private readonly succeeds: boolean) {}

  set src(_value: string) {
    queueMicrotask(() => (this.succeeds ? this.onload?.() : this.onerror?.()));
  }
}

function stubImage(succeeds: boolean): void {
  vi.stubGlobal("Image", function Image() {
    return new LoadingImage(succeeds);
  });
}

describe("kawarpCover", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses an element the page already decoded without fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const element = decodedElement();
    expect(await decodeCover("https://cdn/cover.jpg", element)).toBe(element);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches a CORS bitmap when nothing is decoded", async () => {
    const bitmap = { close: vi.fn() };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x")));
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
    expect(await decodeCover("https://cdn/cover.jpg")).toBe(bitmap);
    expect(fetch).toHaveBeenCalledWith("https://cdn/cover.jpg", { mode: "cors" });
  });

  it("returns null for a failed response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    expect(await fetchCoverBitmap("https://cdn/missing.jpg")).toBeNull();
  });

  it("falls back to an anonymous element when the fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("cors")));
    stubImage(true);
    const cover = await decodeCover("https://cdn/cover.jpg");
    expect(cover).toBeInstanceOf(LoadingImage);
    expect((cover as unknown as LoadingImage).crossOrigin).toBe("anonymous");
  });

  it("returns null when every source fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    stubImage(false);
    expect(await decodeCover("https://cdn/cover.jpg")).toBeNull();
  });

  it("closes a bitmap but leaves an element alone", () => {
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    releaseCover(bitmap);
    expect(bitmap.close).toHaveBeenCalled();
    expect(() => releaseCover(decodedElement())).not.toThrow();
  });
});
