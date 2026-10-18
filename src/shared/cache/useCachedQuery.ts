import { useEffect, useRef, useState } from "react";
import { log } from "@/shared/utils/logger";
import { queryCache } from "./queryCache";

export interface CachedQuery<T> {
  data: T;
  isLoading: boolean;
  error: Error | null;
}

export interface CachedQueryOptions<T> {
  fallback: T;
  staleTimeMs: number;
}

function cachedState<T>(key: string | null, fallback: T): CachedQuery<T> {
  if (!key) return { data: fallback, isLoading: false, error: null };
  const cached = queryCache.get<T>(key);
  return { data: cached ?? fallback, isLoading: cached === undefined, error: null };
}

/**
 * Data kept in `queryCache` under `key`: the cached copy shows at once and a stale one refreshes
 * in the background; a failed load keeps whatever was shown and reports the error. A null key shows
 * the fallback without loading.
 */
export function useCachedQuery<T>(key: string | null, fetcher: () => Promise<T>, options: CachedQueryOptions<T>): CachedQuery<T> {
  const [state, setState] = useState(() => cachedState(key, options.fallback));
  const latest = useRef({ fetcher, fallback: options.fallback });
  latest.current = { fetcher, fallback: options.fallback };

  useEffect(() => {
    setState(cachedState(key, latest.current.fallback));
    if (!key) return;
    let active = true;
    const show = (data: T) => active && setState({ data, isLoading: false, error: null });
    const unsubscribe = queryCache.subscribe<T>(key, show);
    queryCache
      .fetchWithSwr(key, () => latest.current.fetcher(), { staleTimeMs: options.staleTimeMs })
      .then(({ data }) => show(data))
      .catch((error: unknown) => {
        log("yellow", "query", `${key} failed to load`, error);
        if (active) setState((current) => ({ ...current, isLoading: false, error: error instanceof Error ? error : new Error(String(error)) }));
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [key, options.staleTimeMs]);

  return state;
}
