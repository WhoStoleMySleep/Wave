import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { SearchSource } from "@/shared/api";
import { debouncedStorage } from "@/shared/utils/storage";

export interface SearchSourceState {
  source: SearchSource;
  setSource: (source: SearchSource) => void;
}

const SEARCH_SOURCE_STORAGE_KEY = "wave_search_source";

export const SEARCH_SOURCES: readonly SearchSource[] = ["youtube", "deezer"];

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
    },
  ),
);
