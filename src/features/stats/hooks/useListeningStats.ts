import { api, type ListeningStats } from "@/shared/api";
import { queryCache } from "@/shared/cache/queryCache";
import { useCachedQuery } from "@/shared/cache/useCachedQuery";
import { log } from "@/shared/utils/logger";
import { periodBounds, periodId, type PeriodKey } from "../lib/periods";

const STALE_AFTER_MS = 60_000;
const NO_MONTHS: string[] = [];

function statsQueryKey(key: PeriodKey): string {
  return `stats:${periodId(key)}`;
}

/** Stats of a period; a null key loads nothing. */
export function useListeningStats(key: PeriodKey | null) {
  const { data, isLoading, error } = useCachedQuery<ListeningStats | null>(
    key ? statsQueryKey(key) : null,
    async () => (key ? api.getListeningStats(periodBounds(key)) : null),
    { fallback: null, staleTimeMs: STALE_AFTER_MS },
  );
  return { data, isLoading, error };
}

/** Loads a period's stats into the cache ahead, so a recap opened next has them at once. */
export function prefetchListeningStats(key: PeriodKey): void {
  queryCache
    .fetchWithSwr<ListeningStats | null>(statsQueryKey(key), () => api.getListeningStats(periodBounds(key)), { staleTimeMs: STALE_AFTER_MS })
    .catch((error: unknown) => log("yellow", "query", `stats prefetch for ${periodId(key)} failed`, error));
}

/** Local months with listening, newest first, as `YYYY-MM`. */
export function useListeningMonths() {
  const utcOffset = -new Date().getTimezoneOffset();
  const { data, isLoading } = useCachedQuery(
    `stats:months:${utcOffset}`,
    async () => (await api.getListeningMonths(utcOffset)).items ?? NO_MONTHS,
    { fallback: NO_MONTHS, staleTimeMs: STALE_AFTER_MS },
  );
  return { data, isLoading };
}
