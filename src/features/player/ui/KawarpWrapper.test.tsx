import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { KawarpEngine } from "../engine/kawarpEngine";
import { KawarpWrapper } from "./KawarpWrapper";

// @ts-expect-error - act support flag in vitest browserless DOM environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/features/covers", () => ({ getCoverElement: () => undefined, useCoverElement: () => undefined }));

function fakeEngine() {
  return { start: vi.fn(), stop: vi.fn(), dispose: vi.fn(), resize: vi.fn(), loadImage: vi.fn().mockResolvedValue(null) };
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, "hidden", { configurable: true, value: hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("KawarpWrapper", () => {
  let container: HTMLDivElement;
  let root: Root;
  let engine: ReturnType<typeof fakeEngine>;

  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    engine = fakeEngine();
    vi.spyOn(KawarpEngine, "create").mockReturnValue(engine as unknown as KawarpEngine);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    setHidden(false);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("pauses the animation while the window is hidden", () => {
    act(() => root.render(<KawarpWrapper />));
    expect(engine.start).toHaveBeenCalledTimes(1);
    setHidden(true);
    expect(engine.stop).toHaveBeenCalledTimes(1);
    setHidden(false);
    expect(engine.start).toHaveBeenCalledTimes(2);
  });

  it("stops listening for visibility after unmount", () => {
    act(() => root.render(<KawarpWrapper />));
    act(() => root.unmount());
    root = createRoot(container);
    setHidden(true);
    expect(engine.dispose).toHaveBeenCalled();
    expect(engine.stop).not.toHaveBeenCalled();
  });

  it("gives a remounted engine a fresh canvas instead of the one whose context was lost", () => {
    act(() => root.render(<KawarpWrapper />));
    act(() => root.unmount());
    root = createRoot(container);
    act(() => root.render(<KawarpWrapper />));
    const [[first], [second]] = vi.mocked(KawarpEngine.create).mock.calls;
    expect(second).not.toBe(first);
    expect(first.isConnected).toBe(false);
    expect(container.querySelectorAll("canvas")).toHaveLength(1);
  });

  it("reports an engine that failed to start", () => {
    const failure = new Error("WebGL not supported");
    vi.mocked(KawarpEngine.create).mockReturnValue(failure);
    const onError = vi.fn();
    act(() => root.render(<KawarpWrapper onError={onError} />));
    expect(onError).toHaveBeenCalledWith(failure);
  });
});
