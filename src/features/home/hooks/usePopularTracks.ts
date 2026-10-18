import { api, type PopularTimeWindow } from "@/shared/api";
import { useCachedQuery, type CachedQuery } from "@/shared/cache/useCachedQuery";
import { toPopularArtists, toPopularTracks, type PopularItem } from "../lib/homeFeed";

export type { PopularAlbumItem, PopularArtistItem, PopularItem, PopularPlaylistItem, PopularTrackItem } from "../lib/homeFeed";

const STALE_AFTER_MS = 60_000;
const NOTHING: PopularItem[] = [];

function usePopularFeed(key: string, load: () => Promise<PopularItem[]>): Pick<CachedQuery<PopularItem[]>, "data" | "isLoading"> {
  const { data, isLoading } = useCachedQuery(key, load, { fallback: NOTHING, staleTimeMs: STALE_AFTER_MS });
  return { data, isLoading };
}

function usePopularTracksIn(window: PopularTimeWindow, limit: number) {
  return usePopularFeed(`home:popular-tracks:${window}:${limit}`, async () => toPopularTracks((await api.getPopularTracks(window, limit)).items ?? []));
}

export function usePopularTracksOnly(limit = 20) {
  return usePopularTracksIn("7d", limit);
}

export function usePopularTracksAllTime(limit = 20) {
  return usePopularTracksIn("all", limit);
}

/** Artists of the month's most played tracks. */
export function usePopular(limit = 50) {
  return usePopularFeed(`home:popular-artists:${limit}`, async () => toPopularArtists((await api.getPopularTracks("30d", limit)).items ?? []));
}
