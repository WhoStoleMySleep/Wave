import type { CSSProperties, ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MoonFill, RepeatFill, SunFill } from "@mingcute/react";
import { toClientTrack, type ArtistStat, type TrackStat } from "@/shared/api";
import CoverImage from "@/features/covers/ui/CoverImage";
import NowPlayingBars from "@/shared/ui/NowPlayingBars";
import { useTranslation } from "@/languages";
import { useCountUp } from "../../hooks/useCountUp";
import { formatDay, formatHour, formatNumber, formatWeek } from "../../lib/format";
import type { Daypart, RecapSlide } from "../../lib/recap";
import { ArtistAvatar, accentGlow, font } from "../StatsParts";

export interface RecapSlideViewProps {
  slide: RecapSlide;
  /** "Autumn 2026" or "2026". */
  periodLabel: string;
  covers: Record<string, string>;
  /** The entry of a list slide whose music is playing. */
  sample?: number;
}

/** Where the accent light sits for each part of the day: low sun, high sun, setting sun, a glow from below. */
const DAYPART_GLOWS: Record<Daypart, Glow> = {
  morning: [10, 20],
  day: [50, 0],
  evening: [90, 20],
  night: [50, 100],
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

/** Position of a slide's glow, in percent of the frame. */
type Glow = [number, number];

/** "accent" fills the frame with the accent colour for a slide that should stand out. */
type Tone = "dark" | "accent";

function shadeGlow(x: number, y: number): CSSProperties {
  return {
    backgroundImage: `radial-gradient(circle at ${x}% ${y}%, color-mix(in srgb, var(--bg-primary) 45%, transparent), transparent 65%)`,
  };
}

/**
 * The app's dark background lit by a slowly drifting accent glow; slides about
 * a cover or an artist blur it in behind, like the full-screen player.
 */
function Frame({ glow, backdrop, tone = "dark", children }: { glow: Glow; backdrop?: string; tone?: Tone; children: ReactNode }) {
  // on an accent fill, accent text would vanish, so it takes the text colour there
  const contentStyle = tone === "accent" ? ({ ...font, "--accent-primary": "var(--text-primary)" } as CSSProperties) : font;
  return (
    <div className={`absolute inset-0 overflow-hidden ${tone === "accent" ? "bg-accent-primary" : "bg-bg-primary"}`}>
      <AnimatePresence initial={false}>
        {backdrop && (
          <motion.div
            key={backdrop}
            className="absolute inset-[-20%]"
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1.25 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { duration: 0.6 }, scale: { duration: 8, ease: "linear" } }}
          >
            <CoverImage src={backdrop} alt="" fill sizes="480px" className="object-cover blur-3xl opacity-50" draggable={false} />
            <div className="absolute inset-0 bg-black/60" aria-hidden />
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div
        className="absolute inset-[-15%]"
        style={tone === "accent" ? shadeGlow(...glow) : accentGlow(...glow, backdrop ? 25 : 40)}
        animate={{ x: ["0%", "6%", "0%"], y: ["0%", "-5%", "0%"] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      />
      <div className="relative flex h-full flex-col justify-center px-[28px] pt-[84px] pb-[48px] text-text-primary" style={contentStyle}>
        {children}
      </div>
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[14px] font-[600] uppercase tracking-[0.12em] text-accent-primary">{children}</p>;
}

function Headline({ children, size = "text-[34px]" }: { children: ReactNode; size?: string }) {
  return <h2 className={`m-0 ${size} font-[800] leading-[1.05] tracking-[-0.03em] break-words`}>{children}</h2>;
}

function Note({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[16px] leading-snug text-text-secondary">{children}</p>;
}

function BigNumber({ value }: { value: number }) {
  const { locale } = useTranslation();
  const shown = useCountUp(value);
  return <span className="block text-[84px] max-sm:text-[68px] font-[900] leading-none tracking-[-0.05em] tabular-nums text-accent-primary">{formatNumber(shown, locale)}</span>;
}

function ArtistRows({ stats, covers }: { stats: ArtistStat[]; covers: Record<string, string> }) {
  return (
    <ol className="m-0 p-0 list-none flex flex-col gap-[12px]">
      {stats.map(({ artist }, index) => (
        <Reveal key={artist.id || artist.name} order={index + 1} as="li" className="flex items-center gap-[14px]">
          <span className="w-[22px] text-[22px] font-[800] text-accent-primary tabular-nums">{index + 1}</span>
          <ArtistAvatar name={artist.name} url={covers[artist.id]} className="w-[52px] h-[52px] ring-2 ring-border-alpha-33" />
          <span className="min-w-0 truncate text-[19px] font-[700]">{artist.name}</span>
        </Reveal>
      ))}
    </ol>
  );
}

/** The list of top tracks; the one whose music plays stands out, the rest step back. */
function TrackRows({ stats, playing }: { stats: TrackStat[]; playing?: number }) {
  return (
    <ol className="m-0 p-0 list-none flex flex-col gap-[12px]">
      {stats.map((stat, index) => {
        const track = toClientTrack(stat.track);
        const dimmed = playing !== undefined && playing !== index;
        return (
          <Reveal key={track.id} order={index + 1} as="li">
            {/* the reveal animates its own opacity, so the dimming sits one level in */}
            <span className={`flex items-center gap-[14px] transition-opacity duration-500 ${dimmed ? "opacity-45" : ""}`}>
              <span className="w-[22px] flex justify-center text-[22px] font-[800] text-accent-primary tabular-nums">
                {playing === index ? <NowPlayingBars playing /> : index + 1}
              </span>
              <span className="relative w-[52px] h-[52px] shrink-0 overflow-hidden rounded-md bg-bg-panel">
                {track.coverUrl && <CoverImage src={track.coverUrl} alt={track.title} fill sizes="52px" className="object-cover" draggable={false} />}
              </span>
              <span className="min-w-0 flex flex-col">
                <span className="truncate text-[18px] font-[700]">{track.title}</span>
                <span className="truncate text-[14px] text-text-secondary">{track.artists}</span>
              </span>
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
            className={`flex-1 rounded-t-[3px] origin-bottom ${hour === peakHour ? "bg-accent-primary" : "bg-border-alpha-33"}`}
            style={{ height: `${Math.max(3, (minutes / peak) * 100)}%` }}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: 0.4 + hour * 0.03, duration: 0.5, ease: "easeOut" }}
          />
        ))}
      </div>
      <div className="mt-[6px] flex justify-between text-[12px] text-text-tertiary tabular-nums">
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
        <ArtistAvatar name={names[0]} url={urls[0]} className="w-[150px] h-[150px] ring-4 ring-border-alpha-33" letterClass="text-[48px]" />
      </motion.div>
      <motion.div className="-ml-[36px]" initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.35, duration: 0.7 }}>
        <ArtistAvatar name={names[1]} url={urls[1]} className="w-[150px] h-[150px] ring-4 ring-border-alpha-33" letterClass="text-[48px]" />
      </motion.div>
    </div>
  );
}

/** One slide of the recap; the frame fills its parent. */
export default function RecapSlideView({ slide, periodLabel, covers, sample }: RecapSlideViewProps) {
  const { t, locale } = useTranslation();

  switch (slide.kind) {
    case "intro":
      return (
        <Frame glow={[15, 85]}>
          <motion.div
            className="absolute -right-[30%] -top-[10%] h-[70%] aspect-square rounded-full bg-accent-primary/30 blur-3xl"
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
        <Frame glow={[85, 15]} tone="accent">
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
        <Frame glow={[50, 30]} backdrop={url}>
          <Reveal order={0}><Eyebrow>{t("stats.recap.top_artist_title")}</Eyebrow></Reveal>
          <Reveal order={1} className="my-[24px] flex justify-center">
            <ArtistAvatar name={artist.name} url={url} className="w-[68%] aspect-square ring-4 ring-border-alpha-33 shadow-2xl" letterClass="text-[72px]" />
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
        <Frame glow={[100, 0]} backdrop={covers[slide.stats[0].artist.id]}>
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
        <Frame glow={[50, 30]} backdrop={track.coverUrl}>
          <Reveal order={0}><Eyebrow>{t("stats.recap.top_track_title")}</Eyebrow></Reveal>
          <Reveal order={1} className="my-[24px] flex justify-center">
            <motion.div
              className="relative w-[72%] aspect-square overflow-hidden rounded-xl bg-bg-panel shadow-2xl"
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

    case "topTracks": {
      const playing = sample !== undefined ? slide.stats[sample] : undefined;
      return (
        <Frame glow={[0, 100]} backdrop={playing && toClientTrack(playing.track).coverUrl}>
          <Reveal order={0} className="mb-[24px]"><Headline>{t("stats.recap.top_tracks_title")}</Headline></Reveal>
          <TrackRows stats={slide.stats} playing={sample} />
          <Reveal order={slide.stats.length + 1} className="mt-[24px]">
            <Note>{t("stats.recap.top_tracks_note", { count: slide.total })}</Note>
          </Reveal>
        </Frame>
      );
    }

    case "onRepeat": {
      const track = toClientTrack(slide.repeat.track);
      return (
        <Frame glow={[50, 40]} backdrop={track.coverUrl}>
          <Reveal order={0} className="flex items-center gap-[8px]">
            <RepeatFill size={18} color="var(--accent-primary)" />
            <Eyebrow>{t("stats.recap.repeat_title")}</Eyebrow>
          </Reveal>
          <Reveal order={1} className="my-[24px] flex justify-center">
            <motion.div
              className="relative w-[62%] aspect-square overflow-hidden rounded-full bg-bg-panel shadow-2xl ring-[10px] ring-bg-primary/60"
              animate={{ rotate: 360 }}
              transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
            >
              {track.coverUrl && <CoverImage src={track.coverUrl} alt={track.title} fill sizes="320px" className="object-cover" draggable={false} />}
              <span className="absolute left-1/2 top-1/2 h-[14%] w-[14%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-bg-primary" aria-hidden />
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
        <Frame glow={DAYPART_GLOWS[slide.daypart]}>
          <Reveal order={0}><Icon size={44} color="var(--accent-primary)" /></Reveal>
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
        <Frame glow={[90, 90]}>
          <Reveal order={0}><Eyebrow>{t("stats.recap.top_day_title")}</Eyebrow></Reveal>
          <Reveal order={1} className="mt-[12px]"><Headline size="text-[56px] max-sm:text-[46px]">{formatDay(slide.day.date, locale)}</Headline></Reveal>
          <Reveal order={2} className="mt-[16px]">
            <Note>{t("stats.recap.top_day_note", { minutes: t("stats.minutes_short", { count: formatNumber(slide.day.minutes, locale) }) })}</Note>
          </Reveal>
        </Frame>
      );

    case "streak":
      return (
        <Frame glow={[20, 10]} tone="accent">
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
        <Frame glow={[50, 50]} backdrop={artist ? covers[artist.id] : undefined}>
          <Reveal order={0}><Headline size="text-[44px]">{t("stats.recap.discovery_title", { count: slide.count })}</Headline></Reveal>
          {artist && (
            <>
              <Reveal order={1} className="my-[28px] flex justify-center">
                <ArtistAvatar name={artist.name} url={covers[artist.id]} className="w-[56%] aspect-square ring-4 ring-border-alpha-33 shadow-2xl" letterClass="text-[64px]" />
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
        <Frame glow={[50, 25]}>
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
    <Frame glow={[50, 100]}>
      <Reveal order={0} className="relative overflow-hidden rounded-[24px] bg-bg-elevated p-[22px] shadow-2xl ring-1 ring-border-alpha-14">
        <div className="absolute inset-0" style={accentGlow(100, 0, 35)} aria-hidden />
        <div className="relative">
        <div className="flex items-center gap-[14px]">
          {topArtist && <ArtistAvatar name={topArtist.artist.name} url={covers[topArtist.artist.id]} className="w-[72px] h-[72px] ring-2 ring-border-alpha-33" />}
          <div className="min-w-0">
            <p className="m-0 text-[13px] font-[600] uppercase tracking-[0.1em] text-accent-primary">{t("stats.recap.title")}</p>
            <p className="m-0 text-[30px] font-[800] leading-tight tracking-[-0.02em]">{periodLabel}</p>
          </div>
        </div>
        <div className="mt-[20px] grid grid-cols-2 gap-[16px]">
          <SummaryList title={t("stats.top_artists")} names={stats.topArtists.slice(0, 5).map(({ artist }) => artist.name)} />
          <SummaryList title={t("stats.top_songs")} names={stats.topTracks.slice(0, 5).map(({ track }) => track.title)} />
        </div>
        <div className="mt-[20px]">
          <p className="m-0 text-[13px] text-text-tertiary">{t("stats.recap.minutes_label")}</p>
          <p className="m-0 text-[40px] font-[900] leading-none tracking-[-0.04em] tabular-nums text-accent-primary">{formatNumber(stats.minutesListened, locale)}</p>
        </div>
        </div>
      </Reveal>
      <Reveal order={1} className="mt-[24px] text-center"><Note>{t("stats.recap.outro_subtitle")}</Note></Reveal>
    </Frame>
  );
}

function SummaryList({ title, names }: { title: string; names: string[] }) {
  return (
    <div className="min-w-0">
      <p className="m-0 mb-[6px] text-[13px] text-text-tertiary">{title}</p>
      <ol className="m-0 p-0 list-none flex flex-col gap-[3px]">
        {names.map((name, index) => (
          <li key={`${index}-${name}`} className="flex gap-[6px] text-[14px] font-[700] min-w-0">
            <span className="text-accent-primary tabular-nums">{index + 1}</span>
            <span className="truncate">{name}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
