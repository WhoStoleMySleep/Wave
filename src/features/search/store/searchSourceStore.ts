import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { SearchSource } from "@/shared/api";
import { debouncedStorage } from "@/shared/utils/storage";

export interface SearchSourceState {
  source: SearchSource;
  setSource: (source: SearchSource) => void;
}

const SEARCH_SOURCE_STORAGE_KEY = "wave_search_source";

export const SEARCH_SOURCES: readonly SearchSource[] = ["youtube", "deezer", "yandex"];

/** The catalog search last looked in, so the next search starts there. */
export const useSearchSourceStore = create<SearchSourceState>()(
  persist(
    (set) => ({
      source: "youtube",
      setSource: (source) => set({ source }),
    }),
    {
      name: SEARCH_SOURCE_STORAGE_KEY,
      storage: createJSONStorage(() => debouncedStorage),
      // a saved source may be one the switch no longer offers
      merge: (saved, current) => {
        const source = (saved as Partial<SearchSourceState> | undefined)?.source;
        return source && SEARCH_SOURCES.includes(source) ? { ...current, source } : current;
      },
    },
  ),
);
