import { api } from "@/shared/api";
import { queryCache } from "@/shared/cache/queryCache";
import { useCachedQuery } from "@/shared/cache/useCachedQuery";
import { collectionKey, dailyMixPage } from "@/features/collection/lib/collectionPage";
import { toDailyMix, type DailyMix } from "../lib/homeFeed";

export { getDailyMixArtists, type DailyMix } from "../lib/homeFeed";

const STALE_AFTER_MS = 120_000;
const NOTHING: DailyMix[] = [];

async function loadDailyMixes(): Promise<DailyMix[]> {
  const mixes = ((await api.getDailyMixes()).items ?? []).map(toDailyMix);
  mixes.forEach((mix) => queryCache.set(collectionKey("playlist", mix.id), dailyMixPage(mix)));
  return mixes;
}

/** Each mix's page is cached along the way, so opening a mix shows it at once. */
export function useDailyMixes() {
  const { data, isLoading } = useCachedQuery("home:daily-mixes", loadDailyMixes, { fallback: NOTHING, staleTimeMs: STALE_AFTER_MS });
  return { data, isLoading };
}
