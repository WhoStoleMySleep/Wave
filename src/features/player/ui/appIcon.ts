import { log } from "@/shared/utils/logger";

const ICON_SIZE = 512;
const ICON_CORNER_RADIUS = 112;
const ICON_BORDER_WIDTH = 2;
const LOGO_BOX = { x: 128.7, y: 107.8, width: 254.6, height: 296.4 } as const;

const ICON_COLORS = {
  light: { background: "#f5f5f7", border: "rgba(0, 0, 0, 0.08)" },
  dark: { background: "#0d0d10", border: "rgba(255, 255, 255, 0.08)" },
} as const;

export interface AppIconStyle {
  isLight: boolean;
  invertLogo: boolean;
}

function loadLogo(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function traceIconShape(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(0, 0, ICON_SIZE, ICON_SIZE, ICON_CORNER_RADIUS);
  else ctx.rect(0, 0, ICON_SIZE, ICON_SIZE);
}

function drawBackground(ctx: CanvasRenderingContext2D, isLight: boolean): void {
  const colors = isLight ? ICON_COLORS.light : ICON_COLORS.dark;
  traceIconShape(ctx);
  ctx.fillStyle = colors.background;
  ctx.fill();
  ctx.lineWidth = ICON_BORDER_WIDTH;
  ctx.strokeStyle = colors.border;
  ctx.stroke();
}

function drawLogo(ctx: CanvasRenderingContext2D, logo: HTMLImageElement, invert: boolean): void {
  if (invert) ctx.filter = "invert(1)";
  ctx.drawImage(logo, LOGO_BOX.x, LOGO_BOX.y, LOGO_BOX.width, LOGO_BOX.height);
}

/** @returns a PNG data URL of the app icon, or null when the logo or the canvas is unavailable */
export async function renderAppIcon(logoSrc: string, style: AppIconStyle): Promise<string | null> {
  const canvas = document.createElement("canvas");
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const logo = await loadLogo(logoSrc);
  if (!logo) {
    log("yellow", "app-icon", `logo failed to load: ${logoSrc}`);
    return null;
  }
  drawBackground(ctx, style.isLight);
  drawLogo(ctx, logo, style.isLight && style.invertLogo);
  return canvas.toDataURL("image/png");
}

function faviconLink(): HTMLLinkElement {
  const existing = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (existing) return existing;
  const link = document.createElement("link");
  link.rel = "icon";
  document.head.appendChild(link);
  return link;
}

/** Sets the icon in the dock or taskbar through the native shell and as the page favicon. */
export function applyAppIcon(dataUrl: string): void {
  faviconLink().href = dataUrl;
  window.waveNative?.setAppIcon(dataUrl).catch((error: unknown) => {
    log("yellow", "app-icon", "native icon update failed", error);
  });
}
