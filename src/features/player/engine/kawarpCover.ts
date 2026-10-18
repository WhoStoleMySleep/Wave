import { log } from "@/shared/utils/logger";
import { errorMessage } from "./engineUtils";

export type CoverImage = ImageBitmap | HTMLImageElement;

function isDecoded(image: HTMLImageElement | undefined): image is HTMLImageElement {
  return image !== undefined && image.complete && image.naturalWidth > 0;
}

/** A CORS fetch gives WebGL an untainted bitmap even when the cover CDN is cross-origin. */
export async function fetchCoverBitmap(src: string): Promise<ImageBitmap | null> {
  try {
    const response = await fetch(src, { mode: "cors" });
    if (!response.ok) return null;
    return await createImageBitmap(await response.blob());
  } catch (error) {
    log("yellow", "kawarp", `cover fetch failed: ${errorMessage(error)}`);
    return null;
  }
}

function loadCoverElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/** @returns the cover ready for upload: the element the page already decoded, a fetched bitmap, or a fresh element */
export async function decodeCover(src: string, preDecoded?: HTMLImageElement): Promise<CoverImage | null> {
  if (isDecoded(preDecoded)) return preDecoded;
  return (await fetchCoverBitmap(src)) ?? (await loadCoverElement(src));
}

/** Frees the GPU-side memory of a bitmap; an element is left to the page that owns it. */
export function releaseCover(image: CoverImage): void {
  if ("close" in image) image.close();
}
