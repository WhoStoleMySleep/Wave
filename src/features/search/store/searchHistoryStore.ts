import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Track } from "@/shared/types";
import { debouncedStorage } from "@/shared/utils/storage";

export type SearchHistoryItemType = "track" | "artist" | "album" | "playlist" | "query";

export interface SearchHistoryPayload {
  id: string;
  artistId?: string;
  artist_id?: string;
  artistList?: Track["artistList"];
  totalTracks?: number;
  total_tracks?: number;
}

export interface SearchHistoryItem {
  id: string;
  type: SearchHistoryItemType;
  title: string;
  subtitle?: string;
  coverUrl?: string;
  explicit?: boolean;
  duration?: string;
  durationMs?: number;
  itemData?: SearchHistoryPayload;
  timestamp: number;
}

export type NewSearchHistoryItem = Omit<SearchHistoryItem, "timestamp">;

export interface SearchHistoryState {
  items: SearchHistoryItem[];
  addItem: (item: NewSearchHistoryItem) => void;
  removeItem: (id: string) => void;
  clearHistory: () => void;
}

const SEARCH_HISTORY_STORAGE_KEY = "wave_search_history";
const MAX_HISTORY_ITEMS = 30;

function normalizedQuery(title: string): string {
  return title.trim().toLowerCase();
}

function isSameEntry(a: NewSearchHistoryItem, b: NewSearchHistoryItem): boolean {
  if (a.type === "query" && b.type === "query") return normalizedQuery(a.title) === normalizedQuery(b.title);
  return a.id === b.id;
}

/** Puts `item` on top, replacing an earlier entry for the same thing; a query matches regardless of case. */
export function withHistoryItem(items: readonly SearchHistoryItem[], item: NewSearchHistoryItem, now: number): SearchHistoryItem[] {
  const rest = items.filter((existing) => !isSameEntry(existing, item));
  return [{ ...item, timestamp: now }, ...rest].slice(0, MAX_HISTORY_ITEMS);
}

export const useSearchHistoryStore = create<SearchHistoryState>()(
  persist(
    (set) => ({
      items: [],
      addItem: (item) => set((state) => ({ items: withHistoryItem(state.items, item, Date.now()) })),
      removeItem: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
      clearHistory: () => set({ items: [] }),
    }),
    {
      name: SEARCH_HISTORY_STORAGE_KEY,
      storage: createJSONStorage(() => debouncedStorage),
    },
  ),
);
