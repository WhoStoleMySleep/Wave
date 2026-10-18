import { getApiBaseUrl } from "./baseUrl";

/** Resolves a server-relative media path against the API; absolute URLs pass through. */
export function mediaUrl(path: string): string {
  if (!path) return "";
  if (/^https?:\/\//.test(path)) return path;
  return getApiBaseUrl() + (path.startsWith("/") ? path : `/${path}`);
}

const GOOGLE_IMAGE_HOST = /[\w-]+\.(?:googleusercontent|ggpht)\.com/i;
const GOOGLE_SIZE_SUFFIX = /=(?:w\d+-h\d+|s\d+)(?:-[\w-]+)*/;

/** Google and YouTube avatars come scaled down; `=s0` asks their CDN for the original size. */
export function toMaxQualityAvatarUrl(url: string | undefined): string {
  if (!url) return "";
  if (!GOOGLE_IMAGE_HOST.test(url)) return url;
  return GOOGLE_SIZE_SUFFIX.test(url) ? url.replace(GOOGLE_SIZE_SUFFIX, "=s0") : `${url}=s0`;
}
