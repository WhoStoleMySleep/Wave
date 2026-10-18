import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { KawarpEngine } from "./kawarpEngine";

type FakeGl = Record<string, Mock>;

function fakeGl(): FakeGl {
  const methods = new Map<string, Mock>();
  const loseContext = vi.fn();
  return new Proxy({} as FakeGl, {
    get(_target, prop) {
      if (typeof prop !== "string") return undefined;
      if (/^[A-Z0-9_]+$/.test(prop)) return prop.length;
      if (!methods.has(prop)) methods.set(prop, vi.fn(() => (prop.startsWith("get") ? true : {})));
      if (prop === "getExtension") methods.get(prop)!.mockReturnValue({ loseContext });
      return methods.get(prop);
    },
  });
}

function canvasWith(gl: FakeGl | null): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  vi.spyOn(canvas, "getContext").mockReturnValue(gl as never);
  return canvas;
}

function createEngine(gl: FakeGl): KawarpEngine {
  const engine = KawarpEngine.create(canvasWith(gl));
  if (engine instanceof Error) throw engine;
  return engine;
}

function bitmap(): ImageBitmap {
  return { close: vi.fn() } as unknown as ImageBitmap;
}

describe("KawarpEngine", () => {
  let gl: FakeGl;

  beforeEach(() => {
    gl = fakeGl();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("x"))));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns an Error when the canvas has no WebGL", () => {
    const engine = KawarpEngine.create(canvasWith(null));
    expect(engine).toBeInstanceOf(Error);
  });

  it("returns an Error and frees the context when a shader fails to compile", () => {
    gl.getShaderParameter.mockReturnValue(false);
    const engine = KawarpEngine.create(canvasWith(gl));
    expect(engine).toBeInstanceOf(Error);
    expect(gl.getExtension("WEBGL_lose_context")?.loseContext).toHaveBeenCalled();
  });

  it("uploads, blurs and draws a loaded cover", async () => {
    const cover = bitmap();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(cover));
    const engine = createEngine(gl);
    gl.drawArrays.mockClear();
    expect(await engine.loadImage("https://cdn/a.jpg")).toBeNull();
    expect(cover.close).toHaveBeenCalled();
    engine.renderImmediate();
    expect(gl.drawArrays).toHaveBeenCalled();
  });

  it("releases a cover superseded by a newer load without uploading it", async () => {
    const stale = bitmap();
    let resolveStale: (value: ImageBitmap) => void = () => {};
    vi.stubGlobal("createImageBitmap", vi.fn()
      .mockReturnValueOnce(new Promise((resolve) => (resolveStale = resolve)))
      .mockResolvedValueOnce(bitmap()));
    const engine = createEngine(gl);
    const first = engine.loadImage("https://cdn/a.jpg");
    await engine.loadImage("https://cdn/b.jpg");
    const uploadsBefore = gl.texImage2D.mock.calls.length;
    resolveStale(stale);
    expect(await first).toBeNull();
    expect(stale.close).toHaveBeenCalled();
    expect(gl.texImage2D.mock.calls.length).toBe(uploadsBefore);
  });

  it("returns an Error when WebGL refuses every upload", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockImplementation(() => Promise.resolve(bitmap())));
    const engine = createEngine(gl);
    gl.texImage2D.mockImplementation(() => {
      throw new DOMException("tainted", "SecurityError");
    });
    expect(await engine.loadImage("https://cdn/a.jpg")).toBeInstanceOf(Error);
  });

  it("does not draw before a cover is loaded", () => {
    const engine = createEngine(gl);
    gl.drawArrays.mockClear();
    engine.renderImmediate();
    expect(gl.drawArrays).not.toHaveBeenCalled();
  });

  it("schedules one animation loop and cancels it on dispose", () => {
    const request = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(7);
    const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const engine = createEngine(gl);
    engine.start();
    engine.start();
    engine.dispose();
    expect(request).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith(7);
  });

  it("skips display frames beyond maxFps", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap()));
    let loop: FrameRequestCallback = () => {};
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      loop = callback;
      return 1;
    });
    vi.spyOn(performance, "now").mockReturnValue(0);
    const engine = createEngine(gl);
    await engine.loadImage("https://cdn/a.jpg");
    engine.start();
    gl.drawArrays.mockClear();
    [16.7, 33.3, 50, 66.7].forEach((timestamp) => loop(timestamp));
    expect(gl.drawArrays.mock.calls.length).toBe(4);
  });

  it("renders the warp pass at a quarter of the canvas resolution", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap()));
    const canvas = canvasWith(gl);
    canvas.width = 1600;
    canvas.height = 900;
    const engine = KawarpEngine.create(canvas) as KawarpEngine;
    await engine.loadImage("https://cdn/a.jpg");
    gl.viewport.mockClear();
    engine.renderImmediate();
    expect(gl.viewport).toHaveBeenCalledWith(0, 0, 400, 225);
    expect(gl.viewport).toHaveBeenLastCalledWith(0, 0, 1600, 900);
  });
});
