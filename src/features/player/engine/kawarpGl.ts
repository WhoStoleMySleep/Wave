import { log } from "@/shared/utils/logger";
import { errorMessage } from "./engineUtils";
import { VERTEX_SHADER } from "./kawarpShaders";

const QUAD_VERTEX_COUNT = 6;
const POSITION_ATTRIBUTE = 0;
const TEX_COORD_ATTRIBUTE = 1;
const COMPONENTS_PER_VERTEX = 2;
const QUAD_POSITIONS = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
const QUAD_TEX_COORDS = new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]);

export interface RenderTarget {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

export interface Quad {
  positions: WebGLBuffer;
  texCoords: WebGLBuffer;
}

function required<T>(resource: T | null, kind: string): T {
  if (resource === null) throw new Error(`Failed to create ${kind}`);
  return resource;
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = required(gl.createShader(type), "shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  const error = gl.getShaderInfoLog(shader);
  gl.deleteShader(shader);
  throw new Error(`Shader compile error: ${error}`);
}

function linkProgram(gl: WebGLRenderingContext, shaders: WebGLShader[]): WebGLProgram {
  const program = required(gl.createProgram(), "program");
  shaders.forEach((shader) => gl.attachShader(program, shader));
  gl.bindAttribLocation(program, POSITION_ATTRIBUTE, "a_position");
  gl.bindAttribLocation(program, TEX_COORD_ATTRIBUTE, "a_texCoord");
  gl.linkProgram(program);
  shaders.forEach((shader) => gl.deleteShader(shader));
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
  const error = gl.getProgramInfoLog(program);
  gl.deleteProgram(program);
  throw new Error(`Program link error: ${error}`);
}

function createBuffer(gl: WebGLRenderingContext, data: Float32Array): WebGLBuffer {
  const buffer = required(gl.createBuffer(), "buffer");
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return buffer;
}

function bindAttribute(gl: WebGLRenderingContext, buffer: WebGLBuffer, location: number): void {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, COMPONENTS_PER_VERTEX, gl.FLOAT, false, 0, 0);
}

/** Every pass draws this quad through the same attribute slots, so the pointers are set once for the context. */
export function createQuad(gl: WebGLRenderingContext): Quad {
  const quad = { positions: createBuffer(gl, QUAD_POSITIONS), texCoords: createBuffer(gl, QUAD_TEX_COORDS) };
  bindAttribute(gl, quad.positions, POSITION_ATTRIBUTE);
  bindAttribute(gl, quad.texCoords, TEX_COORD_ATTRIBUTE);
  return quad;
}

export function deleteQuad(gl: WebGLRenderingContext, quad: Quad): void {
  gl.deleteBuffer(quad.positions);
  gl.deleteBuffer(quad.texCoords);
}

export function createTexture(gl: WebGLRenderingContext): WebGLTexture {
  const texture = required(gl.createTexture(), "texture");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return texture;
}

export function createRenderTarget(gl: WebGLRenderingContext, width: number, height: number): RenderTarget {
  const texture = createTexture(gl);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const framebuffer = required(gl.createFramebuffer(), "framebuffer");
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  return { framebuffer, texture, width, height };
}

export function deleteRenderTarget(gl: WebGLRenderingContext, target: RenderTarget): void {
  gl.deleteFramebuffer(target.framebuffer);
  gl.deleteTexture(target.texture);
}

/** @returns whether WebGL accepted the image; a tainted cross-origin element is refused */
export function uploadTexture(gl: WebGLRenderingContext, texture: WebGLTexture, image: TexImageSource): boolean {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    return true;
  } catch (error) {
    log("yellow", "kawarp", `texture upload refused: ${errorMessage(error)}`);
    return false;
  }
}

export function bindTexture(gl: WebGLRenderingContext, unit: number, texture: WebGLTexture | null): void {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
}

/** Frees both units so the next pass can render into a texture that was bound for reading. */
export function unbindTextures(gl: WebGLRenderingContext): void {
  bindTexture(gl, 1, null);
  bindTexture(gl, 0, null);
}

/** Draws the quad into `target`, or onto the canvas when it is null. */
export function drawQuad(gl: WebGLRenderingContext, target: RenderTarget | null, size: { width: number; height: number }): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer ?? null);
  gl.viewport(0, 0, size.width, size.height);
  gl.drawArrays(gl.TRIANGLES, 0, QUAD_VERTEX_COUNT);
}

export class ShaderPass<Uniform extends string> {
  private readonly program: WebGLProgram;
  private readonly locations = new Map<Uniform, WebGLUniformLocation | null>();

  constructor(private readonly gl: WebGLRenderingContext, fragmentSource: string, uniforms: readonly Uniform[]) {
    const shaders = [compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER), compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)];
    this.program = linkProgram(gl, shaders);
    uniforms.forEach((name) => this.locations.set(name, gl.getUniformLocation(this.program, `u_${name}`)));
  }

  public use(): void {
    this.gl.useProgram(this.program);
  }

  public setInt(name: Uniform, value: number): void {
    this.gl.uniform1i(this.location(name), value);
  }

  public setFloat(name: Uniform, value: number): void {
    this.gl.uniform1f(this.location(name), value);
  }

  public setVec2(name: Uniform, x: number, y: number): void {
    this.gl.uniform2f(this.location(name), x, y);
  }

  public setVec3(name: Uniform, value: readonly [number, number, number]): void {
    this.gl.uniform3fv(this.location(name), value);
  }

  public dispose(): void {
    this.gl.deleteProgram(this.program);
  }

  private location(name: Uniform): WebGLUniformLocation | null {
    return this.locations.get(name) ?? null;
  }
}
