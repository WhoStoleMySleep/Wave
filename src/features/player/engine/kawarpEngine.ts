import { log } from "@/shared/utils/logger";
import { errorMessage } from "./engineUtils";
import { CoverBlend } from "./kawarpBlend";
import { type CoverImage, decodeCover, fetchCoverBitmap, releaseCover } from "./kawarpCover";
import {
  bindTexture,
  createQuad,
  createRenderTarget,
  createTexture,
  deleteQuad,
  deleteRenderTarget,
  drawQuad,
  type Quad,
  type RenderTarget,
  ShaderPass,
  unbindTextures,
  uploadTexture,
} from "./kawarpGl";
import { type KawarpOptions, type KawarpSettings, resolveKawarpSettings } from "./kawarpSettings";
import { BLEND_SHADER, DOMAIN_WARP_SHADER, KAWASE_BLUR_SHADER, OUTPUT_SHADER, TINT_SHADER } from "./kawarpShaders";

export type { KawarpOptions } from "./kawarpSettings";

const BLUR_SIZE = 160;
const BLUR_AREA = { width: BLUR_SIZE, height: BLUR_SIZE };
const BLUR_OFFSET_STEP = 0.5;
const MS_PER_SECOND = 1000;
const WARP_RESOLUTION_SCALE = 0.25;
const FRAME_JITTER_MS = 2;
const CONTEXT_OPTIONS: WebGLContextAttributes = {
  alpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  powerPreference: "high-performance",
};

interface Size {
  width: number;
  height: number;
}

interface Passes {
  blur: ShaderPass<"resolution" | "texture" | "offset">;
  blend: ShaderPass<"texture1" | "texture2" | "blend">;
  tint: ShaderPass<"texture" | "tintColor" | "tintIntensity">;
  warp: ShaderPass<"texture" | "time" | "intensity">;
  output: ShaderPass<"texture" | "saturation" | "dithering" | "time" | "scale" | "resolution">;
}

function createPasses(gl: WebGLRenderingContext): Passes {
  return {
    blur: new ShaderPass(gl, KAWASE_BLUR_SHADER, ["resolution", "texture", "offset"]),
    blend: new ShaderPass(gl, BLEND_SHADER, ["texture1", "texture2", "blend"]),
    tint: new ShaderPass(gl, TINT_SHADER, ["texture", "tintColor", "tintIntensity"]),
    warp: new ShaderPass(gl, DOMAIN_WARP_SHADER, ["texture", "time", "intensity"]),
    output: new ShaderPass(gl, OUTPUT_SHADER, ["texture", "saturation", "dithering", "time", "scale", "resolution"]),
  };
}

function canvasSize(canvas: HTMLCanvasElement): Size {
  return { width: Math.max(1, canvas.width), height: Math.max(1, canvas.height) };
}

function warpSize({ width, height }: Size): Size {
  return { width: Math.ceil(width * WARP_RESOLUTION_SCALE), height: Math.ceil(height * WARP_RESOLUTION_SCALE) };
}

/** Browsers cap live WebGL contexts and only reclaim one on GC, so reopening the player would evict the oldest. */
function loseContext(gl: WebGLRenderingContext): void {
  gl.getExtension("WEBGL_lose_context")?.loseContext();
}

export class KawarpEngine {
  private readonly passes: Passes;
  private readonly quad: Quad;
  private readonly sourceTexture: WebGLTexture;
  private readonly blurPing: RenderTarget;
  private readonly blurPong: RenderTarget;
  private readonly transition: RenderTarget;
  private readonly blend: CoverBlend;
  private current: RenderTarget;
  private next: RenderTarget;
  private warpTarget: RenderTarget;
  private outputSize: Size;

  private animationId: number | null = null;
  private lastFrameTime = 0;
  private animationTime = 0;
  private loadSequenceId = 0;
  private hasImage = false;

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly gl: WebGLRenderingContext,
    private readonly settings: KawarpSettings,
  ) {
    this.blend = new CoverBlend(settings.transitionDuration);
    this.passes = createPasses(gl);
    this.quad = createQuad(gl);
    this.sourceTexture = createTexture(gl);
    this.blurPing = createRenderTarget(gl, BLUR_SIZE, BLUR_SIZE);
    this.blurPong = createRenderTarget(gl, BLUR_SIZE, BLUR_SIZE);
    this.current = createRenderTarget(gl, BLUR_SIZE, BLUR_SIZE);
    this.next = createRenderTarget(gl, BLUR_SIZE, BLUR_SIZE);
    this.transition = createRenderTarget(gl, BLUR_SIZE, BLUR_SIZE);
    this.outputSize = canvasSize(canvas);
    const warp = warpSize(this.outputSize);
    this.warpTarget = createRenderTarget(gl, warp.width, warp.height);
    this.setConstantUniforms();
  }

  /** @returns an Error when the canvas has no WebGL or the GPU refused a shader or a buffer */
  public static create(canvas: HTMLCanvasElement, options: KawarpOptions = {}): KawarpEngine | Error {
    const gl = canvas.getContext("webgl", CONTEXT_OPTIONS);
    if (!gl) return new Error("WebGL not supported");
    try {
      return new KawarpEngine(canvas, gl, resolveKawarpSettings(options));
    } catch (error) {
      loseContext(gl);
      log("red", "kawarp", `engine init failed: ${errorMessage(error)}`);
      return error instanceof Error ? error : new Error(errorMessage(error));
    }
  }

  /**
   * Shows the cover, crossfading from the previous one.
   * @returns an Error when the cover could not be decoded or uploaded; null also when a newer call superseded this one
   */
  public async loadImage(src: string, preDecoded?: HTMLImageElement): Promise<Error | null> {
    if (!src) return null;
    const loadId = ++this.loadSequenceId;
    const cover = await decodeCover(src, preDecoded);
    if (!cover) return new Error(`Failed to load image: ${src}`);
    const uploaded = await this.uploadLatest(src, cover, loadId);
    releaseCover(cover);
    if (uploaded === null) return null;
    if (!uploaded) return new Error(`Failed to upload image: ${src}`);
    this.showUploadedCover();
    return null;
  }

  public start(): void {
    if (this.animationId !== null) return;
    this.lastFrameTime = performance.now();
    this.animationId = requestAnimationFrame(this.renderLoop);
  }

  public stop(): void {
    if (this.animationId === null) return;
    cancelAnimationFrame(this.animationId);
    this.animationId = null;
  }

  /** Call after changing the canvas size so the frame does not stretch until the next tick. */
  public resize(): void {
    this.fitCanvas();
    this.renderImmediate();
  }

  public renderImmediate(): void {
    this.render(this.animationTime, performance.now());
  }

  public dispose(): void {
    this.stop();
    this.loadSequenceId++;
    Object.values(this.passes).forEach((pass: Passes[keyof Passes]) => pass.dispose());
    deleteQuad(this.gl, this.quad);
    this.gl.deleteTexture(this.sourceTexture);
    const targets = [this.blurPing, this.blurPong, this.current, this.next, this.transition, this.warpTarget];
    targets.forEach((target) => deleteRenderTarget(this.gl, target));
    loseContext(this.gl);
  }

  /** Uniforms keep their values per program, so only time and the canvas size are sent during the animation. */
  private setConstantUniforms(): void {
    const { blur, blend, tint, warp, output } = this.passes;
    blur.use();
    blur.setVec2("resolution", BLUR_SIZE, BLUR_SIZE);
    blur.setInt("texture", 0);
    blend.use();
    blend.setInt("texture1", 0);
    blend.setInt("texture2", 1);
    tint.use();
    tint.setInt("texture", 0);
    tint.setVec3("tintColor", this.settings.tintColor);
    tint.setFloat("tintIntensity", this.settings.tintIntensity);
    warp.use();
    warp.setInt("texture", 0);
    warp.setFloat("intensity", this.settings.warpIntensity);
    output.use();
    output.setInt("texture", 0);
    output.setFloat("saturation", this.settings.saturation);
    output.setFloat("dithering", this.settings.dithering);
    output.setFloat("scale", this.settings.scale);
    output.setVec2("resolution", this.outputSize.width, this.outputSize.height);
  }

  private async uploadLatest(src: string, cover: CoverImage, loadId: number): Promise<boolean | null> {
    if (loadId !== this.loadSequenceId) return null;
    if (uploadTexture(this.gl, this.sourceTexture, cover)) return true;
    const bitmap = await fetchCoverBitmap(src);
    if (!bitmap) return false;
    const uploaded = loadId === this.loadSequenceId ? uploadTexture(this.gl, this.sourceTexture, bitmap) : null;
    bitmap.close();
    return uploaded;
  }

  private showUploadedCover(): void {
    if (!this.hasImage) {
      this.blurSourceInto(this.next);
      this.blurSourceInto(this.current);
      this.hasImage = true;
      return;
    }
    [this.current, this.next] = [this.next, this.current];
    this.blurSourceInto(this.next);
    this.blend.start(performance.now());
  }

  private blurSourceInto(target: RenderTarget): void {
    unbindTextures(this.gl);
    this.tintSource();
    this.drawBlur(this.runBlurPasses(), target, 0);
    bindTexture(this.gl, 0, null);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  }

  private tintSource(): void {
    this.passes.tint.use();
    bindTexture(this.gl, 0, this.sourceTexture);
    drawQuad(this.gl, this.blurPing, BLUR_AREA);
  }

  private runBlurPasses(): RenderTarget {
    this.passes.blur.use();
    let read = this.blurPing;
    let write = this.blurPong;
    for (let pass = 0; pass < this.settings.blurPasses; pass++) {
      this.drawBlur(read, write, pass + BLUR_OFFSET_STEP);
      [read, write] = [write, read];
    }
    return read;
  }

  private drawBlur(source: RenderTarget, target: RenderTarget, offset: number): void {
    bindTexture(this.gl, 0, source.texture);
    this.passes.blur.setFloat("offset", offset);
    drawQuad(this.gl, target, BLUR_AREA);
  }

  private readonly renderLoop = (timestamp: number): void => {
    this.animationId = requestAnimationFrame(this.renderLoop);
    const elapsedMs = timestamp - this.lastFrameTime;
    if (elapsedMs < MS_PER_SECOND / this.settings.maxFps - FRAME_JITTER_MS) return;
    this.lastFrameTime = timestamp;
    this.animationTime += (elapsedMs / MS_PER_SECOND) * this.settings.animationSpeed;
    this.render(this.animationTime, timestamp);
  };

  private render(time: number, now: number): void {
    if (!this.hasImage) return;
    this.fitCanvas();
    const weight = this.blend.weight(now);
    if (weight !== null) this.drawBlend(weight);
    this.drawWarp(weight === null ? this.next : this.transition, time);
    this.drawOutput(time);
  }

  private fitCanvas(): void {
    const size = canvasSize(this.canvas);
    if (this.outputSize.width === size.width && this.outputSize.height === size.height) return;
    this.outputSize = size;
    const warp = warpSize(size);
    deleteRenderTarget(this.gl, this.warpTarget);
    this.warpTarget = createRenderTarget(this.gl, warp.width, warp.height);
    this.passes.output.use();
    this.passes.output.setVec2("resolution", size.width, size.height);
  }

  private drawBlend(weight: number): void {
    const { blend } = this.passes;
    blend.use();
    bindTexture(this.gl, 0, this.current.texture);
    bindTexture(this.gl, 1, this.next.texture);
    blend.setFloat("blend", weight);
    drawQuad(this.gl, this.transition, BLUR_AREA);
    unbindTextures(this.gl);
  }

  private drawWarp(album: RenderTarget, time: number): void {
    const { warp } = this.passes;
    warp.use();
    bindTexture(this.gl, 0, album.texture);
    warp.setFloat("time", time);
    drawQuad(this.gl, this.warpTarget, this.warpTarget);
  }

  private drawOutput(time: number): void {
    const { output } = this.passes;
    output.use();
    bindTexture(this.gl, 0, this.warpTarget.texture);
    output.setFloat("time", time);
    drawQuad(this.gl, null, this.outputSize);
  }
}
