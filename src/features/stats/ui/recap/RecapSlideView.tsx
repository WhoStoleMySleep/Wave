import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { MoonFill, RepeatFill, SunFill } from "@mingcute/react";
import { toClientTrack, type ArtistStat, type TrackStat } from "@/shared/api";
import CoverImage from "@/features/covers/ui/CoverImage";
import { useTranslation } from "@/languages";
import { useCountUp } from "../../hooks/useCountUp";
import { formatDay, formatHour, formatNumber, formatWeek } from "../../lib/format";
import type { Daypart, RecapSlide } from "../../lib/recap";
import { ArtistAvatar, font } from "../StatsParts";

export interface RecapSlideViewProps {
  slide: RecapSlide;
  /** "Autumn 2026" or "2026". */
  periodLabel: string;
  covers: Record<string, string>;
}

const DAYPART_GRADIENTS: Record<Daypart, string> = {
  morning: "from-amber-300 via-orange-400 to-rose-500",
  day: "from-sky-400 via-cyan-500 to-blue-600",
  evening: "from-rose-500 via-fuchsia-600 to-indigo-700",
  night: "from-indigo-800 via-slate-900 to-black",
};

/** Children rise in one after another; `order` sets the place in the line. */
function Reveal({ order, children, className = "", as = "div" }: { order: number; children: ReactNode; className?: string; as?: "div" | "li" }) {
  const Element = as === "li" ? motion.li : motion.div;
  return (
    <Element
      className={className}
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 + order * 0.14, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Element>
  );
}

function Frame({ gradient, backdrop, children }: { gradient: string; backdrop?: string; children: ReactNode }) {
  return (
    <div className={`absolute inset-0 overflow-hidden bg-gradient-to-br ${gradient}`}>
      {backdrop && (
        <motion.div className="absolute inset-[-20%]" initial={{ scale: 1.1 }} animate={{ scale: 1.25 }} transition={{ duration: 8, ease: "linear" }}>
          <CoverImage src={backdrop} alt="" fill sizes="480px" className="object-cover blur-3xl opacity-70 saturate-150" draggable={false} />
        </motion.div>
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/50" aria-hidden />
      <div className="relative flex h-full flex-col justify-center px-[28px] pt-[84px] pb-[48px] text-white" style={font}>
        {children}
      </div>
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[14px] font-[600] uppercase tracking-[0.12em] text-white/75">{children}</p>;
}

function Headline({ children, size = "text-[34px]" }: { children: ReactNode; size?: string }) {
  return <h2 className={`m-0 ${size} font-[800] leading-[1.05] tracking-[-0.03em] break-words`}>{children}</h2>;
}

function Note({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[16px] leading-snug text-white/80">{children}</p>;
}

function BigNumber({ value }: { value: number }) {
  const { locale } = useTranslation();
  const shown = useCountUp(value);
  return <span className="block text-[84px] max-sm:text-[68px] font-[900] leading-none tracking-[-0.05em] tabular-nums">{formatNumber(shown, locale)}</span>;
}

function ArtistRows({ stats, covers }: { stats: ArtistStat[]; covers: Record<string, string> }) {
  return (
    <ol className="m-0 p-0 list-none flex flex-col gap-[12px]">
      {stats.map(({ artist }, index) => (
        <Reveal key={artist.id || artist.name} order={index + 1} as="li" className="flex items-center gap-[14px]">
          <span className="w-[22px] text-[22px] font-[800] text-white/70 tabular-nums">{index + 1}</span>
          <ArtistAvatar name={artist.name} url={covers[artist.id]} className="w-[52px] h-[52px] ring-2 ring-white/20" />
          <span className="min-w-0 truncate text-[19px] font-[700]">{artist.name}</span>
        </Reveal>
      ))}
    </ol>
  );
}

function TrackRows({ stats }: { stats: TrackStat[] }) {
  return (
    <ol className="m-0 p-0 list-none flex flex-col gap-[12px]">
      {stats.map((stat, index) => {
        const track = toClientTrack(stat.track);
        return (
          <Reveal key={track.id} order={index + 1} as="li" className="flex items-center gap-[14px]">
            <span className="w-[22px] text-[22px] font-[800] text-white/70 tabular-nums">{index + 1}</span>
            <span className="relative w-[52px] h-[52px] shrink-0 overflow-hidden rounded-md bg-white/10">
              {track.coverUrl && <CoverImage src={track.coverUrl} alt={track.title} fill sizes="52px" className="object-cover" draggable={false} />}
            </span>
            <span className="min-w-0 flex flex-col">
              <span className="truncate text-[18px] font-[700]">{track.title}</span>
              <span className="truncate text-[14px] text-white/70">{track.artists}</span>
            </span>
          </Reveal>
        );
      })}
    </ol>
  );
}

function Clock({ hours, peakHour }: { hours: number[]; peakHour: number }) {
  const { locale } = useTranslation();
  const peak = Math.max(...hours, 1);
  return (
    <div>
      <div className="flex h-[140px] items-end gap-[3px]" aria-hidden>
        {hours.map((minutes, hour) => (
          <motion.div
            key={hour}
            className={`flex-1 rounded-t-[3px] origin-bottom ${hour === peakHour ? "bg-white" : "bg-white/30"}`}
            style={{ height: `${Math.max(3, (minutes / peak) * 100)}%` }}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: 0.4 + hour * 0.03, duration: 0.5, ease: "easeOut" }}
          />
        ))}
      </div>
      <div className="mt-[6px] flex justify-between text-[12px] text-white/60 tabular-nums">
        {[0, 6, 12, 18].map((hour) => (
          <span key={hour}>{formatHour(hour, locale)}</span>
        ))}
      </div>
    </div>
  );
}

function PairOfAvatars({ names, urls }: { names: [string, string]; urls: [string?, string?] }) {
  return (
    <div className="flex items-center justify-center">
      <motion.div initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.2, duration: 0.7 }}>
        <ArtistAvatar name={names[0]} url={urls[0]} className="w-[150px] h-[150px] ring-4 ring-white/25" letterClass="text-[48px]" />
      </motion.div>
      <motion.div className="-ml-[36px]" initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.35, duration: 0.7 }}>
        <ArtistAvatar name={names[1]} url={urls[1]} className="w-[150px] h-[150px] ring-4 ring-white/25" letterClass="text-[48px]" />
      </motion.div>
    </div>
  );
}

/** One slide of the recap; the frame fills its parent. */
export default function RecapSlideView({ slide, periodLabel, covers }: RecapSlideViewProps) {
  const { t, locale } = useTranslation();

  switch (slide.kind) {
    case "intro":
      return (
        <Frame gradient="from-indigo-600 via-violet-600 to-fuchsia-500">
          <motion.div
            className="absolute -right-[30%] -top-[10%] h-[70%] aspect-square rounded-full bg-fuchsia-300/40 blur-3xl"
            animate={{ scale: [1, 1.15, 1], rotate: [0, 30, 0] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
            aria-hidden
          />
          <Reveal order={0}><Eyebrow>{t("stats.recap.title")}</Eyebrow></Reveal>
          <Reveal order={1}><Headline size="text-[64px] max-sm:text-[54px]">{periodLabel}</Headline></Reveal>
          <Reveal order={2} className="mt-[16px]"><Note>{t("stats.recap.intro_subtitle")}</Note></Reveal>
        </Frame>
      );

    case "minutes":
      return (
        <Frame gradient="from-emerald-500 via-teal-600 to-cyan-800">
          <Reveal order={0}><Eyebrow>{t("stats.recap.minutes_title")}</Eyebrow></Reveal>
          <Reveal order={1} className="mt-[8px]">
            <BigNumber value={slide.minutes} />
            <span className="block mt-[4px] text-[28px] font-[700]">{t("stats.minutes_unit", { count: slide.minutes })}</span>
          </Reveal>
          <Reveal order={3} className="mt-[20px]"><Note>{t("stats.recap.minutes_note", { perDay: formatNumber(slide.perActiveDay, locale) })}</Note></Reveal>
        </Frame>
      );

    case "topArtist": {
      const { artist, plays, minutes } = slide.stat;
      const url = covers[artist.id];
      return (
        <Frame gradient="from-sky-600 via-indigo-700 to-slate-900" backdrop={url}>
          <Reveal order={0}><Eyebrow>{t("stats.recap.top_artist_title")}</Eyebrow></Reveal>
          <Reveal order={1} className="my-[24px] flex justify-center">
            <ArtistAvatar name={artist.name} url={url} className="w-[68%] aspect-square ring-4 ring-white/25 shadow-2xl" letterClass="text-[72px]" />
          </Reveal>
          <Reveal order={2}><Headline size="text-[40px]">{artist.name}</Headline></Reveal>
          <Reveal order={3} className="mt-[8px]">
            <Note>{t("stats.plays", { count: plays })} · {t("stats.minutes_short", { count: formatNumber(minutes, locale) })}</Note>
          </Reveal>
        </Frame>
      );
    }

    case "topArtists":
      return (
        <Frame gradient="from-blue-600 via-indigo-700 to-violet-900">
          <Reveal order={0} className="mb-[24px]"><Headline>{t("stats.recap.top_artists_title")}</Headline></Reveal>
          <ArtistRows stats={slide.stats} covers={covers} />
          <Reveal order={slide.stats.length + 1} className="mt-[24px]">
            <Note>{t("stats.recap.top_artists_note", { count: slide.total })}</Note>
          </Reveal>
        </Frame>
      );

    case "topTrack": {
      const track = toClientTrack(slide.stat.track);
      return (
        <Frame gradient="from-amber-500 via-orange-600 to-rose-700" backdrop={track.coverUrl}>
          <Reveal order={0}><Eyebrow>{t("stats.recap.top_track_title")}</Eyebrow></Reveal>
          <Reveal order={1} className="my-[24px] flex justify-center">
            <motion.div
              className="relative w-[72%] aspect-square overflow-hidden rounded-xl bg-white/10 shadow-2xl"
              initial={{ rotate: -6, scale: 0.9 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            >
              {track.coverUrl && <CoverImage src={track.coverUrl} alt={track.title} fill sizes="400px" className="object-cover" draggable={false} />}
            </motion.div>
          </Reveal>
          <Reveal order={2}><Headline size="text-[36px]">{track.title}</Headline></Reveal>
          <Reveal order={3} className="mt-[6px]">
            <Note>{track.artists} · {t("stats.plays", { count: slide.stat.plays })}</Note>
          </Reveal>
        </Frame>
      );
    }

    case "topTracks":
      return (
        <Frame gradient="from-rose-500 via-pink-600 to-purple-800">
          <Reveal order={0} className="mb-[24px]"><Headline>{t("stats.recap.top_tracks_title")}</Headline></Reveal>
          <TrackRows stats={slide.stats} />
          <Reveal order={slide.stats.length + 1} className="mt-[24px]">
            <Note>{t("stats.recap.top_tracks_note", { count: slide.total })}</Note>
          </Reveal>
        </Frame>
      );

    case "onRepeat": {
      const track = toClientTrack(slide.repeat.track);
      return (
        <Frame gradient="from-fuchsia-600 via-purple-700 to-indigo-900" backdrop={track.coverUrl}>
          <Reveal order={0} className="flex items-center gap-[8px]">
            <RepeatFill size={18} />
            <Eyebrow>{t("stats.recap.repeat_title")}</Eyebrow>
          </Reveal>
          <Reveal order={1} className="my-[24px] flex justify-center">
            <motion.div
              className="relative w-[62%] aspect-square overflow-hidden rounded-full bg-white/10 shadow-2xl ring-[10px] ring-black/40"
              animate={{ rotate: 360 }}
              transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
            >
              {track.coverUrl && <CoverImage src={track.coverUrl} alt={track.title} fill sizes="320px" className="object-cover" draggable={false} />}
              <span className="absolute left-1/2 top-1/2 h-[14%] w-[14%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/80" aria-hidden />
            </motion.div>
          </Reveal>
          <Reveal order={2}><Headline>{t("stats.repeat_title", { count: slide.repeat.plays })}</Headline></Reveal>
          <Reveal order={3} className="mt-[8px]">
            <Note>
              {track.title} · {t("stats.recap.repeat_note", { plays: t("stats.plays", { count: slide.repeat.plays }), week: formatWeek(slide.repeat.week, locale) })}
            </Note>
          </Reveal>
        </Frame>
      );
    }

    case "clock": {
      const Icon = slide.daypart === "night" || slide.daypart === "evening" ? MoonFill : SunFill;
      return (
        <Frame gradient={DAYPART_GRADIENTS[slide.daypart]}>
          <Reveal order={0}><Icon size={44} /></Reveal>
          <Reveal order={1} className="mt-[12px]"><Headline size="text-[44px]">{t(`stats.recap.daypart.${slide.daypart}`)}</Headline></Reveal>
          <Reveal order={2} className="mt-[8px] mb-[32px]">
            <Note>{t("stats.recap.clock_note", { hour: formatHour(slide.peakHour, locale) })}</Note>
          </Reveal>
          <Clock hours={slide.hours} peakHour={slide.peakHour} />
        </Frame>
      );
    }

    case "topDay":
      return (
        <Frame gradient="from-lime-400 via-emerald-600 to-teal-900">
          <Reveal order={0}><Eyebrow>{t("stats.recap.top_day_title")}</Eyebrow></Reveal>
          <Reveal order={1} className="mt-[12px]"><Headline size="text-[56px] max-sm:text-[46px]">{formatDay(slide.day.date, locale)}</Headline></Reveal>
          <Reveal order={2} className="mt-[16px]">
            <Note>{t("stats.recap.top_day_note", { minutes: t("stats.minutes_short", { count: formatNumber(slide.day.minutes, locale) }) })}</Note>
          </Reveal>
        </Frame>
      );

    case "streak":
      return (
        <Frame gradient="from-orange-400 via-red-500 to-rose-800">
          <Reveal order={0}><BigNumber value={slide.days} /></Reveal>
          <Reveal order={1} className="mt-[8px]">
            <Headline>{t("stats.recap.streak_unit", { count: slide.days })}</Headline>
          </Reveal>
          <Reveal order={2} className="mt-[16px]"><Note>{t("stats.recap.streak_note")}</Note></Reveal>
        </Frame>
      );

    case "discovery": {
      const artist = slide.stat?.artist;
      return (
        <Frame gradient="from-cyan-400 via-sky-600 to-blue-900" backdrop={artist ? covers[artist.id] : undefined}>
          <Reveal order={0}><Headline size="text-[44px]">{t("stats.recap.discovery_title", { count: slide.count })}</Headline></Reveal>
          {artist && (
            <>
              <Reveal order={1} className="my-[28px] flex justify-center">
                <ArtistAvatar name={artist.name} url={covers[artist.id]} className="w-[56%] aspect-square ring-4 ring-white/25 shadow-2xl" letterClass="text-[64px]" />
              </Reveal>
              <Reveal order={2}><Note>{t("stats.recap.discovery_note", { artist: artist.name })}</Note></Reveal>
            </>
          )}
        </Frame>
      );
    }

    case "combo": {
      const [first, second] = slide.combo.artists;
      return (
        <Frame gradient="from-pink-500 via-fuchsia-600 to-violet-900">
          <Reveal order={0} className="mb-[32px]">
            <PairOfAvatars names={[first.name, second.name]} urls={[covers[first.id], covers[second.id]]} />
          </Reveal>
          <Reveal order={1}><Headline>{t("stats.combo_title")}</Headline></Reveal>
          <Reveal order={2} className="mt-[10px]"><Note>{t("stats.combo_text", { first: first.name, second: second.name })}</Note></Reveal>
          <Reveal order={3} className="mt-[6px]"><Note>{formatWeek(slide.combo.week, locale)}</Note></Reveal>
        </Frame>
      );
    }

    case "outro":
      return <OutroSlide slide={slide} periodLabel={periodLabel} covers={covers} />;
  }
}

function OutroSlide({ slide, periodLabel, covers }: { slide: Extract<RecapSlide, { kind: "outro" }>; periodLabel: string; covers: Record<string, string> }) {
  const { t, locale } = useTranslation();
  const { stats } = slide;
  const topArtist = stats.topArtists[0];
  return (
    <Frame gradient="from-zinc-800 via-zinc-900 to-black">
      <Reveal order={0} className="rounded-[24px] bg-gradient-to-br from-violet-600 via-fuchsia-600 to-orange-500 p-[22px] shadow-2xl">
        <div className="flex items-center gap-[14px]">
          {topArtist && <ArtistAvatar name={topArtist.artist.name} url={covers[topArtist.artist.id]} className="w-[72px] h-[72px] ring-2 ring-white/30" />}
          <div className="min-w-0">
            <p className="m-0 text-[13px] font-[600] uppercase tracking-[0.1em] text-white/75">{t("stats.recap.title")}</p>
            <p className="m-0 text-[30px] font-[800] leading-tight tracking-[-0.02em]">{periodLabel}</p>
          </div>
        </div>
        <div className="mt-[20px] grid grid-cols-2 gap-[16px]">
          <SummaryList title={t("stats.top_artists")} names={stats.topArtists.slice(0, 5).map(({ artist }) => artist.name)} />
          <SummaryList title={t("stats.top_songs")} names={stats.topTracks.slice(0, 5).map(({ track }) => track.title)} />
        </div>
        <div className="mt-[20px]">
          <p className="m-0 text-[13px] text-white/75">{t("stats.recap.minutes_label")}</p>
          <p className="m-0 text-[40px] font-[900] leading-none tracking-[-0.04em] tabular-nums">{formatNumber(stats.minutesListened, locale)}</p>
        </div>
      </Reveal>
      <Reveal order={1} className="mt-[24px] text-center"><Note>{t("stats.recap.outro_subtitle")}</Note></Reveal>
    </Frame>
  );
}

function SummaryList({ title, names }: { title: string; names: string[] }) {
  return (
    <div className="min-w-0">
      <p className="m-0 mb-[6px] text-[13px] text-white/75">{title}</p>
      <ol className="m-0 p-0 list-none flex flex-col gap-[3px]">
        {names.map((name, index) => (
          <li key={`${index}-${name}`} className="flex gap-[6px] text-[14px] font-[700] min-w-0">
            <span className="text-white/60 tabular-nums">{index + 1}</span>
            <span className="truncate">{name}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
