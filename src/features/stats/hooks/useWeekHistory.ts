import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ListeningHistoryItem } from "@/shared/api";
import { historyStart } from "../lib/history";

const PAGE_SIZE = 100;

interface WeekHistory {
  items: ListeningHistoryItem[];
  cursor: string | null;
  isLoading: boolean;
  error: Error | null;
}

const INITIAL: WeekHistory = { items: [], cursor: null, isLoading: true, error: null };

/** Plays of the last seven local days, newest first, a page at a time. */
export function useWeekHistory() {
  const [state, setState] = useState<WeekHistory>(INITIAL);
  const [from] = useState(() => historyStart(new Date()).toISOString());
  const loading = useRef(false);
  const mounted = useRef(true);

  const load = useCallback(
    async (cursor?: string) => {
      if (loading.current) return;
      loading.current = true;
      setState((current) => ({ ...current, isLoading: true, error: null }));
      try {
        const page = await api.getHistory(cursor, PAGE_SIZE, { from });
        if (!mounted.current) return;
        setState((current) => ({
          items: cursor ? [...current.items, ...page.items] : page.items,
          cursor: page.nextCursor,
          isLoading: false,
          error: null,
        }));
      } catch (error) {
        if (!mounted.current) return;
        setState((current) => ({ ...current, isLoading: false, error: error instanceof Error ? error : new Error(String(error)) }));
      } finally {
        loading.current = false;
      }
    },
    [from],
  );

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const loadMore = useCallback(() => {
    if (state.cursor) void load(state.cursor);
  }, [load, state.cursor]);

  return { items: state.items, hasMore: state.cursor !== null, isLoading: state.isLoading, error: state.error, loadMore };
}
