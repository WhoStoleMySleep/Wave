import { api, type ListeningStats } from "@/shared/api";
import { useCachedQuery } from "@/shared/cache/useCachedQuery";
import { periodBounds, periodId, type PeriodKey } from "../lib/periods";

const STALE_AFTER_MS = 60_000;
const NO_MONTHS: string[] = [];

/** Stats of a period; a null key loads nothing. */
export function useListeningStats(key: PeriodKey | null) {
  const { data, isLoading, error } = useCachedQuery<ListeningStats | null>(
    key ? `stats:${periodId(key)}` : null,
    async () => (key ? api.getListeningStats(periodBounds(key)) : null),
    { fallback: null, staleTimeMs: STALE_AFTER_MS },
  );
  return { data, isLoading, error };
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
