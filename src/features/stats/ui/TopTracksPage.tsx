import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { toClientTrack } from "@/shared/api";
import SongCardWithMenu from "@/features/player/ui/SongCardWithMenu";
import { playerEngine } from "@/features/player";
import { useTranslation } from "@/languages";
import { useListeningStats } from "../hooks/useListeningStats";
import { formatNumber } from "../lib/format";
import { currentMonth, monthLabel, parseMonth } from "../lib/periods";
import { HighlightedText, SkeletonBlock, StatsPage, font } from "./StatsParts";

export default function TopTracksPage() {
  const { t, locale } = useTranslation();
  const [params] = useSearchParams();
  const month = parseMonth(params.get("month")) ?? currentMonth(new Date());
  const { data: stats, isLoading } = useListeningStats(month);
  const tracks = useMemo(() => stats?.topTracks.map(({ track }) => toClientTrack(track)) ?? [], [stats]);
  const title = `${t("stats.top_songs")} · ${monthLabel(month, locale)}`;

  return (
    <StatsPage title={t("stats.top_songs")} fallbackBackRoute="/capsule">
      <p className="m-0 text-[13px] text-text-tertiary" style={font}>
        {monthLabel(month, locale)}
      </p>
      {isLoading && !stats ? (
        <SkeletonBlock className="mt-[12px] h-[96px]" />
      ) : stats ? (
        <>
          <h1 className="m-0 mt-[8px] text-[30px] max-md:text-[26px] font-[700] leading-[1.15] tracking-[-0.02em] text-text-primary" style={font}>
            <HighlightedText
              translate={(value) => t("stats.songs_heading", { count: stats.trackCount, value })}
              value={formatNumber(stats.trackCount, locale)}
              highlightClass="text-accent-primary"
            />
          </h1>
          <ol className="m-0 mt-[20px] p-0 list-none flex flex-col gap-[2px]">
            {tracks.map((track, index) => (
              <li key={track.id} className="flex items-center gap-[8px]">
                <span className="w-[28px] shrink-0 text-center text-[17px] font-[600] text-accent-primary" style={font}>
                  {index + 1}
                </span>
                <SongCardWithMenu
                  id={track.id}
                  title={track.title}
                  artists={track.artists}
                  artistId={track.artistId}
                  artistList={track.artistList}
                  coverUrl={track.coverUrl}
                  durationMs={track.durationMs}
                  meta={
                    <span className="text-[13px] text-text-tertiary whitespace-nowrap" style={font}>
                      {t("stats.plays", { count: stats.topTracks[index].plays })}
                    </span>
                  }
                  onPlay={() => void playerEngine.playTrack(track, tracks, { context: title, cover: track.coverUrl })}
                  searchType="track"
                  className="flex-1 min-w-0"
                />
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </StatsPage>
  );
}
