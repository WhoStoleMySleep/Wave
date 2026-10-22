import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LeftLine, RightLine, RightSmallLine, TimeFill, SparklesFill } from "@mingcute/react";
import { toClientTrack, type ListeningStats, type StatsWeek } from "@/shared/api";
import CoverImage from "@/features/covers/ui/CoverImage";
import SongCardWithMenu from "@/features/player/ui/SongCardWithMenu";
import { playerEngine } from "@/features/player";
import { useTranslation } from "@/languages";
import { useArtistCovers } from "../hooks/useArtistCovers";
import { prefetchListeningStats, useListeningMonths, useListeningStats } from "../hooks/useListeningStats";
import { capsuleArtistIds, monthDays } from "../lib/capsule";
import { formatNumber, formatWeek } from "../lib/format";
import { currentMonth, monthId, monthName, parseMonth, periodLabel, recapPeriods, type PeriodKey } from "../lib/periods";
import RecapStories from "./recap/RecapStories";
import { ArtistAvatar, SkeletonBlock, StatsPage, accentGlow, font, useCardClass } from "./StatsParts";

type MonthKey = Extract<PeriodKey, { kind: "month" }>;

/** Spotify's sound capsule: one month of listening as a page of cards. */
export default function CapsulePage() {
  const { t, locale } = useTranslation();
  const [params, setParams] = useSearchParams();
  const { data: months } = useListeningMonths();
  const month = parseMonth(params.get("month")) ?? parseMonth(months[0]) ?? currentMonth(new Date());
  const id = monthId(month);
  const { data: stats, isLoading, error } = useListeningStats(month);
  const [recap, setRecap] = useState<PeriodKey | null>(null);
  const closeRecap = useCallback(() => setRecap(null), []);

  // `months` is newest first, so plain string comparison finds the neighbours
  const older = months.find((other) => other < id);
  const newer = months.filter((other) => other > id).at(-1);
  const hasListening = Boolean(stats && stats.minutesListened > 0);

  return (
    <StatsPage title={t("stats.capsule_title")}>
      <p className="m-0 text-[13px] text-text-tertiary" style={font}>
        {t("stats.capsule_title")}
      </p>
      <div className="mt-[4px] flex items-center justify-between gap-[12px]">
        <h1 className="m-0 text-[32px] font-[700] tracking-[-0.02em] text-text-primary" style={font}>
          {monthName(month, locale)}{" "}
          <span className="text-text-tertiary">{month.year}</span>
        </h1>
        <div className="flex items-center gap-[6px]">
          <MonthButton to={older} label={t("stats.previous_month")} onSelect={(next) => setParams({ month: next })}>
            <LeftLine size={18} />
          </MonthButton>
          <MonthButton to={newer} label={t("stats.next_month")} onSelect={(next) => setParams({ month: next })}>
            <RightLine size={18} />
          </MonthButton>
        </div>
      </div>

      <div className="mt-[20px] flex flex-col gap-[12px]">
        {isLoading && !stats ? (
          <CapsuleSkeleton />
        ) : error && !stats ? (
          <Notice text={t("stats.load_error")} />
        ) : !stats || !hasListening ? (
          <Notice text={t("stats.empty")} />
        ) : (
          <CapsuleCards stats={stats} month={month} />
        )}
        <RecapSection months={months} onOpen={setRecap} />
        <HistoryLink />
      </div>

      {recap && <RecapStories period={recap} onClose={closeRecap} />}
    </StatsPage>
  );
}

function MonthButton({ to, label, onSelect, children }: { to?: string; label: string; onSelect: (month: string) => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={!to}
      onClick={() => to && onSelect(to)}
      className="w-[34px] h-[34px] inline-flex items-center justify-center rounded-full border-0 bg-border-alpha-14 text-text-primary transition-opacity disabled:opacity-30 enabled:cursor-pointer enabled:hover:bg-border-alpha-33"
    >
      {children}
    </button>
  );
}

function Notice({ text }: { text: string }) {
  const cardClass = useCardClass();
  return (
    <div className={`${cardClass} px-[20px] py-[28px] text-center text-[14px] text-text-secondary`} style={font}>
      {text}
    </div>
  );
}

function CapsuleSkeleton() {
  return (
    <>
      <SkeletonBlock className="h-[150px]" />
      <div className="grid grid-cols-2 gap-[12px]">
        <SkeletonBlock className="aspect-[4/5]" />
        <SkeletonBlock className="aspect-[4/5]" />
      </div>
    </>
  );
}

function CapsuleCards({ stats, month }: { stats: ListeningStats; month: MonthKey }) {
  const covers = useArtistCovers(capsuleArtistIds(stats));
  return (
    <>
      <MinutesCard stats={stats} month={month} />
      <div className="grid grid-cols-2 gap-[12px]">
        <TopArtistCard stats={stats} month={month} coverUrl={covers[stats.topArtists[0]?.artist.id ?? ""]} />
        <TopSongCard stats={stats} month={month} />
      </div>
      {stats.onRepeat && <RepeatCard repeat={stats.onRepeat} />}
      {stats.combo && <ComboCard combo={stats.combo} covers={covers} />}
      {stats.discovery && <DiscoveryCard stat={stats.discovery} coverUrl={covers[stats.discovery.artist.id]} />}
    </>
  );
}

function CardHeading({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between gap-[8px]">
      <span className="text-[13px] text-text-secondary" style={font}>
        {label}
      </span>
      <RightSmallLine size={18} color="var(--text-tertiary)" className="shrink-0" />
    </div>
  );
}

function MinutesCard({ stats, month }: { stats: ListeningStats; month: MonthKey }) {
  const { t, locale } = useTranslation();
  const cardClass = useCardClass();
  const days = useMemo(() => monthDays(month.year, month.month, stats.days), [month, stats.days]);
  const peak = Math.max(...days, 1);
  return (
    <section className={`${cardClass} p-[20px]`}>
      <span className="text-[13px] text-text-secondary" style={font}>
        {t("stats.time_listened")}
      </span>
      <p className="m-0 mt-[4px] text-[40px] max-md:text-[34px] font-[700] tracking-[-0.03em] leading-none text-accent-primary" style={font}>
        {t("stats.minutes", { count: stats.minutesListened, value: formatNumber(stats.minutesListened, locale) })}
      </p>
      <div className="mt-[20px] flex h-[56px] items-end gap-[3px]" aria-hidden>
        {days.map((minutes, index) => (
          <div
            key={index}
            className={`flex-1 rounded-[2px] ${minutes > 0 ? "bg-accent-primary/80" : "bg-border-alpha-14"}`}
            style={{ height: minutes > 0 ? `${Math.max(8, (minutes / peak) * 100)}%` : "3px" }}
          />
        ))}
      </div>
    </section>
  );
}

function TopArtistCard({ stats, month, coverUrl }: { stats: ListeningStats; month: MonthKey; coverUrl?: string }) {
  const { t } = useTranslation();
  const cardClass = useCardClass();
  const top = stats.topArtists[0];
  if (!top) return <div />;
  return (
    <Link
      to={`/capsule/artists?month=${monthId(month)}`}
      className={`${cardClass} p-[16px] flex flex-col gap-[4px] no-underline transition-transform active:scale-[0.98]`}
    >
      <CardHeading label={t("stats.top_artist")} />
      <span className="truncate text-[20px] font-[700] text-text-primary" style={font}>
        {top.artist.name}
      </span>
      <ArtistAvatar name={top.artist.name} url={coverUrl} className="mt-[10px] w-full aspect-square" letterClass="text-[56px]" />
    </Link>
  );
}

function TopSongCard({ stats, month }: { stats: ListeningStats; month: MonthKey }) {
  const { t } = useTranslation();
  const cardClass = useCardClass();
  const top = stats.topTracks[0];
  if (!top) return <div />;
  const track = toClientTrack(top.track);
  return (
    <Link
      to={`/capsule/tracks?month=${monthId(month)}`}
      className={`${cardClass} p-[16px] flex flex-col gap-[4px] no-underline transition-transform active:scale-[0.98]`}
    >
      <CardHeading label={t("stats.top_song")} />
      <span className="truncate text-[20px] font-[700] text-text-primary" style={font}>
        {track.title}
      </span>
      <div className="relative mt-[10px] w-full aspect-square overflow-hidden rounded-lg bg-bg-panel">
        {track.coverUrl && <CoverImage src={track.coverUrl} alt={track.title} fill sizes="320px" className="object-cover" draggable={false} />}
      </div>
    </Link>
  );
}

function StoryCard({ week, children }: { week: StatsWeek; children: React.ReactNode }) {
  const { locale } = useTranslation();
  const cardClass = useCardClass();
  return (
    <section className={`${cardClass} p-[20px] flex flex-col gap-[14px]`}>
      {children}
      <span className="text-[13px] text-text-tertiary" style={font}>
        {formatWeek(week, locale)}
      </span>
    </section>
  );
}

function RepeatCard({ repeat }: { repeat: NonNullable<ListeningStats["onRepeat"]> }) {
  const { t } = useTranslation();
  const track = toClientTrack(repeat.track);
  const play = () => void playerEngine.playTrack(track, [track], { context: { id: `radio:${track.id}`, title: track.title }, cover: track.coverUrl });
  return (
    <StoryCard week={repeat.week}>
      <div className="relative w-full aspect-[16/10] overflow-hidden rounded-xl bg-bg-panel">
        {track.coverUrl && <CoverImage src={track.coverUrl} alt={track.title} fill sizes="760px" className="object-cover" draggable={false} />}
      </div>
      <div>
        <h2 className="m-0 text-[24px] font-[700] tracking-[-0.02em] text-text-primary" style={font}>
          {t("stats.repeat_title", { count: repeat.plays })}
        </h2>
        <p className="m-0 mt-[6px] text-[15px] leading-snug text-text-secondary" style={font}>
          {t("stats.repeat_text", { track: track.title, artist: track.artists })}
        </p>
      </div>
      <SongCardWithMenu
        id={track.id}
        title={track.title}
        artists={track.artists}
        artistId={track.artistId}
        artistList={track.artistList}
        coverUrl={track.coverUrl}
        durationMs={track.durationMs}
        onPlay={play}
        searchType="track"
        compact
        className="-mx-[8px]"
      />
    </StoryCard>
  );
}

function ComboCard({ combo, covers }: { combo: NonNullable<ListeningStats["combo"]>; covers: Record<string, string> }) {
  const { t } = useTranslation();
  const [first, second] = combo.artists;
  return (
    <StoryCard week={combo.week}>
      <div className="flex items-center justify-center py-[8px]">
        <ArtistLinkAvatar artist={first} url={covers[first.id]} />
        <ArtistLinkAvatar artist={second} url={covers[second.id]} className="-ml-[28px] ring-4 ring-bg-elevated" />
      </div>
      <div>
        <h2 className="m-0 text-[24px] font-[700] tracking-[-0.02em] text-text-primary" style={font}>
          {t("stats.combo_title")}
        </h2>
        <p className="m-0 mt-[6px] text-[15px] leading-snug text-text-secondary" style={font}>
          {t("stats.combo_text", { first: first.name, second: second.name })}
        </p>
      </div>
    </StoryCard>
  );
}

function ArtistLinkAvatar({ artist, url, className = "" }: { artist: { id: string; name: string }; url?: string; className?: string }) {
  const navigate = useNavigate();
  const avatar = <ArtistAvatar name={artist.name} url={url} className={`w-[min(42vw,200px)] aspect-square ${className}`} letterClass="text-[48px]" />;
  if (!artist.id) return avatar;
  return (
    <button type="button" onClick={() => navigate(`/artist?id=${encodeURIComponent(artist.id)}`)} className="border-0 bg-transparent p-0 cursor-pointer rounded-full" aria-label={artist.name}>
      {avatar}
    </button>
  );
}

function DiscoveryCard({ stat, coverUrl }: { stat: NonNullable<ListeningStats["discovery"]>; coverUrl?: string }) {
  const { t } = useTranslation();
  const cardClass = useCardClass();
  return (
    <section className={`${cardClass} p-[20px] flex items-center gap-[18px]`}>
      <ArtistLinkAvatar artist={stat.artist} url={coverUrl} className="!w-[96px]" />
      <div className="min-w-0">
        <span className="text-[13px] text-accent-primary" style={font}>
          {t("stats.discovery_title")}
        </span>
        <h2 className="m-0 mt-[2px] truncate text-[22px] font-[700] tracking-[-0.02em] text-text-primary" style={font}>
          {stat.artist.name}
        </h2>
        <p className="m-0 mt-[4px] text-[14px] text-text-secondary" style={font}>
          {t("stats.discovery_text", { artist: stat.artist.name })} {t("stats.plays", { count: stat.plays })}
        </p>
      </div>
    </section>
  );
}

/** Where each recap card's accent glow sits, so neighbours differ. */
const RECAP_GLOWS: [number, number][] = [
  [85, 10],
  [10, 90],
  [90, 85],
  [15, 15],
];

function RecapSection({ months, onOpen }: { months: string[]; onOpen: (period: PeriodKey) => void }) {
  const { t, locale } = useTranslation();
  const cardClass = useCardClass();
  const periods = useMemo(() => recapPeriods(months, new Date()), [months]);
  if (periods.length === 0) return null;
  const seasonName = (season: string) => t(`stats.season.${season}`);
  return (
    <section className="mt-[12px]">
      <div className="flex items-center gap-[8px]">
        <SparklesFill size={18} color="var(--accent-primary)" />
        <h2 className="m-0 text-[19px] font-[600] tracking-tight text-text-primary" style={font}>
          {t("stats.recaps_title")}
        </h2>
      </div>
      <p className="m-0 mt-[2px] text-[13px] text-text-tertiary" style={font}>
        {t("stats.recaps_hint")}
      </p>
      <div className="mt-[12px] grid grid-cols-2 sm:grid-cols-3 gap-[10px]">
        {periods.map(({ key, inProgress }, index) => (
          <button
            key={`${key.kind}-${key.year}-${key.kind === "season" ? key.season : ""}`}
            type="button"
            onClick={() => onOpen(key)}
            onPointerEnter={() => prefetchListeningStats(key)}
            onFocus={() => prefetchListeningStats(key)}
            className={`${cardClass} relative aspect-square overflow-hidden border-0 p-[14px] text-left cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.98]`}
          >
            <span className="absolute inset-0" style={accentGlow(...RECAP_GLOWS[index % RECAP_GLOWS.length], key.kind === "year" ? 45 : 30)} aria-hidden />
            <span className="relative flex h-full flex-col justify-between" style={font}>
              <span className="text-[12px] font-[600] uppercase tracking-[0.08em] text-accent-primary">
                {inProgress ? t("stats.in_progress") : t("stats.recap.title")}
              </span>
              <span className="text-[24px] font-[800] leading-[1.05] tracking-[-0.02em] text-text-primary">{periodLabel(key, locale, seasonName)}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function HistoryLink() {
  const { t } = useTranslation();
  const cardClass = useCardClass();
  return (
    <Link to="/history" className={`${cardClass} mt-[12px] p-[16px] flex items-center gap-[14px] no-underline transition-transform active:scale-[0.99]`}>
      <span className="w-[40px] h-[40px] shrink-0 rounded-full bg-accent-primary/10 flex items-center justify-center">
        <TimeFill size={20} color="var(--accent-primary)" />
      </span>
      <span className="min-w-0 flex-1 flex flex-col">
        <span className="text-[15px] font-[500] text-text-primary" style={font}>
          {t("stats.history_title")}
        </span>
        <span className="text-[13px] text-text-tertiary" style={font}>
          {t("stats.history_subtitle")}
        </span>
      </span>
      <RightSmallLine size={20} color="var(--text-tertiary)" className="shrink-0" />
    </Link>
  );
}
