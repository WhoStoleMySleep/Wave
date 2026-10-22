import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "@/languages";
import { useArtistCovers } from "../hooks/useArtistCovers";
import { useListeningStats } from "../hooks/useListeningStats";
import { formatNumber } from "../lib/format";
import { currentMonth, monthLabel, parseMonth } from "../lib/periods";
import { ArtistAvatar, HighlightedText, SkeletonBlock, StatsPage, font } from "./StatsParts";

export default function TopArtistsPage() {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const month = parseMonth(params.get("month")) ?? currentMonth(new Date());
  const { data: stats, isLoading } = useListeningStats(month);
  const covers = useArtistCovers(stats?.topArtists.map(({ artist }) => artist.id) ?? []);

  return (
    <StatsPage title={t("stats.top_artists")} fallbackBackRoute="/capsule">
      <p className="m-0 text-[13px] text-text-tertiary" style={font}>
        {monthLabel(month, locale)}
      </p>
      {isLoading && !stats ? (
        <SkeletonBlock className="mt-[12px] h-[96px]" />
      ) : stats ? (
        <>
          <h1 className="m-0 mt-[8px] text-[30px] max-md:text-[26px] font-[700] leading-[1.15] tracking-[-0.02em] text-text-primary" style={font}>
            <HighlightedText
              translate={(value) => t("stats.artists_heading", { count: stats.artistCount, value })}
              value={formatNumber(stats.artistCount, locale)}
              highlightClass="text-accent-primary"
            />
          </h1>
          <ol className="m-0 mt-[20px] p-0 list-none flex flex-col gap-[4px]">
            {stats.topArtists.map(({ artist, plays }, index) => (
              <li key={artist.id || artist.name}>
                <button
                  type="button"
                  disabled={!artist.id}
                  onClick={() => navigate(`/artist?id=${encodeURIComponent(artist.id)}`)}
                  className="w-full flex items-center gap-[16px] rounded-xl border-0 bg-transparent px-[8px] py-[8px] text-left enabled:cursor-pointer enabled:hover:bg-border-alpha-14 transition-colors"
                >
                  <span className="w-[24px] shrink-0 text-center text-[17px] font-[600] text-accent-primary" style={font}>
                    {index + 1}
                  </span>
                  <ArtistAvatar name={artist.name} url={covers[artist.id]} className="w-[64px] h-[64px]" />
                  <span className="min-w-0 flex-1 flex flex-col">
                    <span className="truncate text-[16px] text-text-primary" style={font}>
                      {artist.name}
                    </span>
                    <span className="text-[13px] text-text-tertiary" style={font}>
                      {t("stats.plays", { count: plays })}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </StatsPage>
  );
}
