const DEFAULT_API = "https://wave.wms";

export const API_BASE_URL = ((import.meta.env.VITE_API_URL as string | undefined) || DEFAULT_API).replace(/\/+$/, "");

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}
