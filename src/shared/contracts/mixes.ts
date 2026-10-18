import type { CatalogTrack } from "./catalog";

export interface DailyMix {
  id: string;
  title: string;
  description: string;
  clusterArtists: string[];
  trackCount: number;
  tracks: CatalogTrack[];
}

export interface DailyMixes {
  items: DailyMix[];
  generatedAt: string;
}
