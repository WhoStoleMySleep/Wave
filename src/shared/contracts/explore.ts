import type { CatalogTrack } from "./catalog";

export type PopularTimeWindow = "24h" | "7d" | "30d" | "all";

export interface PopularTrack {
  rank: number;
  track: CatalogTrack;
  playCount: number;
  uniqueListeners: number;
  score: number;
  viewer: { liked: boolean };
}

export interface PopularTracksPage {
  window: PopularTimeWindow;
  generatedAt: string;
  items: PopularTrack[];
}
