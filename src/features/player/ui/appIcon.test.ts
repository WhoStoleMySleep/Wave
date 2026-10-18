import { afterEach, describe, expect, it, vi } from "vitest";
import { applyAppIcon, renderAppIcon } from "./appIcon";

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

function fakeContext() {
  return { beginPath: vi.fn(), roundRect: vi.fn(), rect: vi.fn(), fill: vi.fn(), stroke: vi.fn(), drawImage: vi.fn(), filter: "none" };
}

function stubCanvas(context: ReturnType<typeof fakeContext> | null): void {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,icon");
}

describe("appIcon", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    delete window.waveNative;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the logo onto a rounded background", async () => {
    const context = fakeContext();
    stubCanvas(context);
    stubImage(true);
    expect(await renderAppIcon("/logo.svg", { isLight: false, invertLogo: true })).toBe("data:image/png;base64,icon");
    expect(context.roundRect).toHaveBeenCalled();
    expect(context.drawImage).toHaveBeenCalled();
    expect(context.filter).toBe("none");
  });

  it("inverts a monochrome logo in the light theme", async () => {
    const context = fakeContext();
    stubCanvas(context);
    stubImage(true);
    await renderAppIcon("/logo.svg", { isLight: true, invertLogo: true });
    expect(context.filter).toBe("invert(1)");
  });

  it("draws a square where roundRect is missing", async () => {
    const context = { ...fakeContext(), roundRect: undefined };
    stubCanvas(context as unknown as ReturnType<typeof fakeContext>);
    stubImage(true);
    await renderAppIcon("/logo.svg", { isLight: false, invertLogo: false });
    expect(context.rect).toHaveBeenCalled();
  });

  it("returns null when the logo fails to load", async () => {
    stubCanvas(fakeContext());
    stubImage(false);
    expect(await renderAppIcon("/missing.svg", { isLight: false, invertLogo: false })).toBeNull();
  });

  it("returns null without a 2D canvas", async () => {
    stubCanvas(null);
    expect(await renderAppIcon("/logo.svg", { isLight: false, invertLogo: false })).toBeNull();
  });

  it("creates the favicon link once and reuses it", () => {
    applyAppIcon("data:one");
    applyAppIcon("data:two");
    const links = document.head.querySelectorAll<HTMLLinkElement>("link[rel~='icon']");
    expect(links).toHaveLength(1);
    expect(links[0].href).toBe("data:two");
  });

  it("passes the icon to the native shell and survives its failure", async () => {
    const setAppIcon = vi.fn().mockRejectedValue(new Error("denied"));
    window.waveNative = { setAppIcon } as unknown as typeof window.waveNative;
    applyAppIcon("data:icon");
    await Promise.resolve();
    expect(setAppIcon).toHaveBeenCalledWith("data:icon");
  });
});
