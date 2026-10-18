import type { CSSProperties } from "react";

export interface BlockCustomization {
  opacity: number;
  blur: number;
  dim: number;
}

export type BlockStyle = CSSProperties & Record<`--${string}`, string>;

export const MIN_OPACITY = 25;
export const MAX_OPACITY = 100;
export const MIN_BLUR = 10;
export const MAX_BLUR = 40;
export const MIN_DIM = 8;
export const MAX_DIM = 85;

export const DEFAULT_BLOCK_CONFIG: BlockCustomization = { opacity: 100, blur: 0, dim: 0 };
export const DEFAULT_GLASS_CONFIG: BlockCustomization = { opacity: 60, blur: 20, dim: 15 };

const OPAQUE_BACKGROUND = "var(--color-bg-primary, #0a0a0a)";
const BASE_RGB = "10, 10, 10";
const PERCENT = 100;
const GLASS_RANGE = MAX_OPACITY - MIN_OPACITY;
const PILL_ALPHA = { from: [0.55, 0.35], to: [0.45, 0.3] };
const PILL_HOVER_ALPHA = { from: [0.7, 0.35], to: [0.58, 0.32] };
const GLASS_BLUR_PX = [8, 16];
const PROMINENT_ALPHA = [1, 0.18];

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function clampOr(value: number | undefined, min: number, max: number, fallback: number): number {
  return typeof value === "number" ? clamp(value, min, max) : fallback;
}

export function clampBlockConfig(config: Partial<BlockCustomization>): BlockCustomization {
  return {
    opacity: clampOr(config.opacity, MIN_OPACITY, MAX_OPACITY, DEFAULT_BLOCK_CONFIG.opacity),
    blur: clampOr(config.blur, MIN_BLUR, MAX_BLUR, DEFAULT_BLOCK_CONFIG.blur),
    dim: clampOr(config.dim, MIN_DIM, MAX_DIM, DEFAULT_BLOCK_CONFIG.dim),
  };
}

/** Blur and dim show only through a see-through block, so an opaque one counts as untouched whatever they hold. */
export function isOpaque(config: BlockCustomization): boolean {
  return config.opacity === MAX_OPACITY;
}

function fade([start, drop]: number[], t: number, digits: number): string {
  return (start - drop * t).toFixed(digits);
}

function pillGradient({ from, to }: typeof PILL_ALPHA, t: number): string {
  return `linear-gradient(135deg, rgba(0, 0, 0, ${fade(from, t, 3)}) 0%, rgba(0, 0, 0, ${fade(to, t, 3)}) 100%)`;
}

function tint(config: BlockCustomization): string {
  const base = `rgba(${BASE_RGB}, ${config.opacity / PERCENT})`;
  const dim = config.dim / PERCENT;
  return dim > 0 ? `linear-gradient(rgba(0, 0, 0, ${dim}), rgba(0, 0, 0, ${dim})), ${base}` : base;
}

/** Glass applies only in the dark theme over a wallpaper; the pills inside grow lighter as the block grows clearer. */
export function getBlockStyle(config: BlockCustomization, isDark: boolean, hasCustomBg: boolean): BlockStyle {
  if (!hasCustomBg || !isDark) return {};
  if (isOpaque(config)) return { background: OPAQUE_BACKGROUND, "--glass-pill-border": "none" };
  const t = (MAX_OPACITY - config.opacity) / GLASS_RANGE;
  const blur = config.blur > 0 ? `blur(${config.blur}px)` : undefined;
  return {
    background: tint(config),
    backdropFilter: blur,
    WebkitBackdropFilter: blur,
    "--glass-pill-bg": pillGradient(PILL_ALPHA, t),
    "--glass-pill-bg-hover": pillGradient(PILL_HOVER_ALPHA, t),
    "--glass-pill-border": "none",
    "--glass-blur": `${Math.round(GLASS_BLUR_PX[0] + GLASS_BLUR_PX[1] * t)}px`,
    "--glass-prominent-bg": `rgba(255, 255, 255, ${fade(PROMINENT_ALPHA, t, 2)})`,
  };
}

export function isGlassThemeActive(state: {
  backgroundImage: string | null;
  sidebar: BlockCustomization;
  contentView: BlockCustomization;
  miniplayer: BlockCustomization;
}): boolean {
  if (!state.backgroundImage) return false;
  return [state.sidebar, state.contentView, state.miniplayer].some((block) => !isOpaque(block) && block.blur > 0);
}
