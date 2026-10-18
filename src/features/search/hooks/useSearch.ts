import { useCallback, useEffect, useRef, useState } from "react";
import { api, toClientTrack, type SearchAlbum, type SearchArtist, type SearchItem, type SearchPlaylist } from "@/shared/api";
import type { Track } from "@/shared/types";
import { log } from "@/shared/utils/logger";

export interface SearchResults {
  all: SearchItem[];
  track: Track[];
  artist: SearchArtist[];
  album: SearchAlbum[];
  playlist: SearchPlaylist[];
}

export type SearchKind = keyof SearchResults;

export interface SearchOptions {
  enabled?: boolean;
  debounceMs?: number;
}

export interface SearchState<T> {
  items: T[];
  loading: boolean;
  hasLoaded: boolean;
  error: Error | null;
}

export interface SearchResult<T> extends SearchState<T> {
  runNow: () => void;
}

const MIN_QUERY_LENGTH = 2;
const DEFAULT_DEBOUNCE_MS = 320;

const SELECT: { [K in SearchKind]: (items: SearchItem[]) => SearchResults[K] } = {
  all: (items) => items,
  track: (items) => items.flatMap((item) => (item.type === "track" ? [toClientTrack(item)] : [])),
  artist: (items) => items.filter((item): item is SearchArtist => item.type === "artist"),
  album: (items) => items.filter((item): item is SearchAlbum => item.type === "album"),
  playlist: (items) => items.filter((item): item is SearchPlaylist => item.type === "playlist"),
};

/** @returns the results, or the error once the request failed */
export async function searchFor<K extends SearchKind>(kind: K, query: string): Promise<SearchResults[K] | Error> {
  try {
    const response = await api.search(query, kind);
    return SELECT[kind](response.items);
  } catch (error) {
    log("yellow", "search", `${kind} search for "${query}" failed`, error);
    return error instanceof Error ? error : new Error(String(error));
  }
}

function idle<T>(): SearchState<T> {
  return { items: [], loading: false, hasLoaded: false, error: null };
}

function settled<T>(result: T[] | Error): SearchState<T> {
  if (result instanceof Error) return { items: [], loading: false, hasLoaded: true, error: result };
  return { items: result, loading: false, hasLoaded: true, error: null };
}

function useSearchRequest<K extends SearchKind>(kind: K) {
  type Item = SearchResults[K][number];
  const [state, setState] = useState<SearchState<Item>>(idle);
  const latest = useRef(0);
  const fetchedQuery = useRef<string | null>(null);

  const run = useCallback(
    async (query: string) => {
      const request = ++latest.current;
      setState((current) => ({ ...current, loading: true }));
      const result = (await searchFor(kind, query)) as Item[] | Error;
      if (request !== latest.current) return;
      fetchedQuery.current = result instanceof Error ? null : query;
      setState(settled(result));
    },
    [kind],
  );

  const cancel = useCallback((next?: SearchState<Item>) => {
    latest.current += 1;
    setState((current) => next ?? (current.loading ? { ...current, loading: false } : current));
  }, []);

  const wait = useCallback(() => {
    setState((current) => (current.loading ? current : { ...current, loading: true }));
  }, []);

  return { state, run, cancel, wait, fetchedQuery };
}

/**
 * Searches as the user types: waits for a pause, drops answers for an outdated query,
 * and keeps the last results while the search is disabled.
 */
export function useSearch<K extends SearchKind>(
  query: string,
  kind: K,
  { enabled = true, debounceMs = DEFAULT_DEBOUNCE_MS }: SearchOptions = {},
): SearchResult<SearchResults[K][number]> {
  const { state, run, cancel, wait, fetchedQuery } = useSearchRequest(kind);
  const trimmed = query.trim();
  const searchable = enabled && trimmed.length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    if (trimmed.length < MIN_QUERY_LENGTH) {
      fetchedQuery.current = null;
      cancel(idle());
      return;
    }
    if (!enabled) return;
    if (fetchedQuery.current === trimmed) return cancel();
    wait();
    const timer = setTimeout(() => void run(trimmed), debounceMs);
    return () => clearTimeout(timer);
  }, [cancel, debounceMs, enabled, fetchedQuery, run, trimmed, wait]);

  const runNow = useCallback(() => {
    if (searchable) void run(trimmed);
  }, [run, searchable, trimmed]);

  return { ...state, runNow };
}
