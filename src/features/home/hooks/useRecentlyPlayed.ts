import { api } from "@/shared/api";
import { useCachedQuery } from "@/shared/cache/useCachedQuery";
import { toRecentItems, type PopularItem } from "../lib/homeFeed";

const STALE_AFTER_MS = 60_000;
const MAX_HISTORY_PAGE = 100;
const MIN_HISTORY_PAGE = 60;
const ENTRIES_PER_ITEM = 3;
const NOTHING: PopularItem[] = [];

/** Album plays collapse into one item, so the history page is fetched a few times longer than `limit`. */
export function useRecentlyPlayed(limit = 20) {
  const load = async () => {
    const pageSize = Math.min(MAX_HISTORY_PAGE, Math.max(limit * ENTRIES_PER_ITEM, MIN_HISTORY_PAGE));
    return toRecentItems((await api.getHistory(undefined, pageSize)).items ?? [], limit);
  };
  const { data, isLoading } = useCachedQuery(`home:recent:${limit}`, load, { fallback: NOTHING, staleTimeMs: STALE_AFTER_MS });
  return { data, isLoading };
}
