import { api } from "@/shared/api";
import { useCachedQuery } from "@/shared/cache/useCachedQuery";
import { toDailyMix, type DailyMix } from "@/features/home/lib/homeFeed";
import {
  albumPage,
  catalogPlaylistPage,
  collectionKey,
  dailyMixPage,
  isDailyMixId,
  isPlaylistContents,
  userPlaylistPage,
  type CollectionPageData,
} from "../lib/collectionPage";

export type { CollectionPageData } from "../lib/collectionPage";

const STALE_AFTER_MS = 300_000;

async function findDailyMix(ids: string[]): Promise<DailyMix | null> {
  const wanted = new Set(ids);
  const mix = ((await api.getDailyMixes()).items ?? []).find((item) => wanted.has(item.id));
  return mix ? toDailyMix(mix) : null;
}

/** Any type other than "playlist" loads an album. */
async function fetchCollection(type: string, id: string): Promise<CollectionPageData> {
  const ids = [id, decodeURIComponent(id)];
  if (type === "playlist" && isDailyMixId(ids)) {
    const mix = await findDailyMix(ids);
    if (mix) return dailyMixPage(mix);
  }
  if (type !== "playlist") return albumPage(await api.getAlbum(id), ids[1]);
  const playlist = await api.getPlaylist(id);
  return isPlaylistContents(playlist) ? userPlaylistPage(playlist) : catalogPlaylistPage(playlist);
}

export function useCollection(type: string | null, id: string | null) {
  const key = type && id ? collectionKey(type, id) : null;
  const { data, isLoading } = useCachedQuery<CollectionPageData | null>(
    key,
    () => (type && id ? fetchCollection(type, id) : Promise.resolve(null)),
    { fallback: null, staleTimeMs: STALE_AFTER_MS },
  );
  return { data, loading: isLoading };
}
