import { useMemo } from "react";
import { RepeatFill, SkipForwardFill } from "@mingcute/react";
import { toClientTrack, type ListeningHistoryItem } from "@/shared/api";
import SongCardWithMenu from "@/features/player/ui/SongCardWithMenu";
import { playerEngine } from "@/features/player";
import { useTranslation, type TFunction } from "@/languages";
import { useWeekHistory } from "../hooks/useWeekHistory";
import { formatTime, formatWeekday } from "../lib/format";
import { daysAgo, groupByDay } from "../lib/history";
import { SkeletonBlock, StatsPage, font, useCardClass } from "./StatsParts";

function dayLabel(date: Date, now: Date, locale: string, t: TFunction): string {
  const ago = daysAgo(date, now);
  if (ago === 0) return t("stats.today");
  if (ago === 1) return t("stats.yesterday");
  return formatWeekday(date, locale);
}

/** Every play of the last seven days with how much of it was heard. */
export default function HistoryPage() {
  const { t, locale } = useTranslation();
  const { items, hasMore, isLoading, error, loadMore } = useWeekHistory();
  const days = useMemo(() => groupByDay(items), [items]);
  const now = new Date();
  const cardClass = useCardClass();

  return (
    <StatsPage title={t("stats.history_title")} fallbackBackRoute="/capsule">
      <h1 className="m-0 text-[32px] font-[700] tracking-[-0.02em] text-text-primary" style={font}>
        {t("stats.history_title")}
      </h1>
      <p className="m-0 mt-[2px] text-[14px] text-text-tertiary" style={font}>
        {t("stats.history_subtitle")}
      </p>

      {isLoading && items.length === 0 ? (
        <div className="mt-[24px] flex flex-col gap-[8px]">
          {Array.from({ length: 6 }, (_, index) => (
            <SkeletonBlock key={index} className="h-[56px] !rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className={`${cardClass} mt-[24px] px-[20px] py-[28px] text-center text-[14px] text-text-secondary`} style={font}>
          {error ? t("stats.load_error") : t("stats.history_empty")}
        </div>
      ) : (
        days.map((day) => (
          <section key={day.date.getTime()} className="mt-[24px]">
            <div className="flex items-baseline justify-between gap-[12px] py-[6px] border-b border-solid border-border-primary">
              <h2 className="m-0 text-[17px] font-[600] text-text-primary" style={font}>
                {dayLabel(day.date, now, locale, t)}
              </h2>
              <span className="text-[13px] text-text-tertiary" style={font}>
                {t("stats.minutes_short", { count: day.minutes })}
              </span>
            </div>
            <div className="mt-[4px] flex flex-col">
              {day.items.map((item) => (
                <HistoryRow key={item.id} item={item} locale={locale} t={t} />
              ))}
            </div>
          </section>
        ))
      )}

      {hasMore && items.length > 0 && (
        <button
          type="button"
          onClick={loadMore}
          disabled={isLoading}
          className="mt-[20px] mx-auto block h-[36px] px-[18px] rounded-full border-0 bg-border-alpha-14 text-[13px] font-[500] text-text-primary enabled:cursor-pointer enabled:hover:bg-border-alpha-33 disabled:opacity-50"
          style={font}
        >
          {t("stats.show_more")}
        </button>
      )}
    </StatsPage>
  );
}

function HistoryRow({ item, locale, t }: { item: ListeningHistoryItem; locale: string; t: TFunction }) {
  const track = toClientTrack(item.track);
  const percent = Math.round(item.completionRate * 100);
  return (
    <SongCardWithMenu
      id={track.id}
      title={track.title}
      artists={track.artists}
      artistId={track.artistId}
      artistList={track.artistList}
      coverUrl={track.coverUrl}
      durationMs={track.durationMs}
      explicit={track.explicit}
      meta={
        <span className="flex items-center gap-[10px] text-[13px] text-text-tertiary whitespace-nowrap" style={font}>
          {item.loopCount > 0 && (
            <span className="flex items-center gap-[3px] text-accent-primary" title={`×${item.loopCount + 1}`}>
              <RepeatFill size={14} />×{item.loopCount + 1}
            </span>
          )}
          {item.skipped ? (
            <span className="flex items-center gap-[3px] text-accent-warning" title={t("stats.skipped")}>
              <SkipForwardFill size={14} />
              <span className="max-md:hidden">{t("stats.skipped")}</span>
            </span>
          ) : (
            <span className="flex items-center gap-[6px]" title={`${percent}%`}>
              <span className="relative h-[4px] w-[40px] overflow-hidden rounded-full bg-border-alpha-14 max-md:hidden">
                <span className="absolute inset-y-0 left-0 rounded-full bg-accent-primary" style={{ width: `${percent}%` }} />
              </span>
              <span className="w-[34px] text-right tabular-nums">{percent}%</span>
            </span>
          )}
          <span className="w-[44px] text-right tabular-nums">{formatTime(item.listenedAt, locale)}</span>
        </span>
      }
      onPlay={() => void playerEngine.playTrack(track, [track], { context: { id: `radio:${track.id}`, title: track.title }, cover: track.coverUrl })}
      searchType="track"
    />
  );
}
