import type { SearchSource } from "@/shared/api";
import { useTranslation } from "@/languages";
import { SEARCH_SOURCES, useSearchSourceStore } from "../store/searchSourceStore";

const SOURCE_NAMES: Record<SearchSource, string> = {
  youtube: "YouTube",
  deezer: "Deezer",
};

/** Picks the catalog search looks in; whatever is found still plays from YouTube. */
export function SearchSourceSwitch() {
  const { t } = useTranslation();
  const source = useSearchSourceStore((state) => state.source);
  const setSource = useSearchSourceStore((state) => state.setSource);

  return (
    <div
      role="group"
      aria-label={t("search.source")}
      className="flex shrink-0 items-center gap-[2px] rounded-[6px] bg-border-alpha-14 p-[2px]"
    >
      {SEARCH_SOURCES.map((option) => {
        const active = option === source;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => setSource(option)}
            className={`rounded-[5px] border-none px-[10px] py-[5px] text-[12.5px] transition-colors cursor-pointer select-none ${
              active
                ? "bg-bg-panel text-text-primary font-medium"
                : "bg-transparent text-text-secondary hover:text-text-primary"
            }`}
            style={{ fontFamily: "var(--font-inter), sans-serif", lineHeight: "1.2" }}
          >
            {SOURCE_NAMES[option]}
          </button>
        );
      })}
    </div>
  );
}
