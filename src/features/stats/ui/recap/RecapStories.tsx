import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CloseLine, LeftLine, PauseFill, PlayFill, RightLine } from "@mingcute/react";
import { useTranslation } from "@/languages";
import { useArtistCovers } from "../../hooks/useArtistCovers";
import { useListeningStats } from "../../hooks/useListeningStats";
import { periodLabel, type PeriodKey } from "../../lib/periods";
import { buildRecapSlides, recapArtistIds } from "../../lib/recap";
import { font } from "../StatsParts";
import RecapSlideView from "./RecapSlideView";

const SLIDE_MS = 7000;
/** A press shorter than this turns the slide; a longer one only held it paused. */
const TAP_MS = 250;

export interface RecapStoriesProps {
  period: PeriodKey;
  onClose: () => void;
}

/**
 * The recap as full-screen stories: slides move on by themselves, a tap on the
 * left or right third steps back or forward, holding pauses. Escape (and the
 * Android back button, which the app replays as Escape) closes it.
 */
export default function RecapStories({ period, onClose }: RecapStoriesProps) {
  const { t, locale } = useTranslation();
  const { data: stats, isLoading, error } = useListeningStats(period);
  const slides = useMemo(() => (stats ? buildRecapSlides(stats) : []), [stats]);
  const covers = useArtistCovers(stats ? recapArtistIds(stats) : []);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const pressedAt = useRef(0);
  const label = periodLabel(period, locale, (season) => t(`stats.season.${season}`));

  const next = () => (index + 1 < slides.length ? setIndex(index + 1) : onClose());
  const previous = () => setIndex(Math.max(0, index - 1));
  const keys = useRef({ next, previous, onClose });
  keys.current = { next, previous, onClose };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const actions: Record<string, () => void> = {
        Escape: () => keys.current.onClose(),
        ArrowRight: () => keys.current.next(),
        ArrowLeft: () => keys.current.previous(),
        " ": () => setPaused((current) => !current),
      };
      const action = actions[event.key];
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      action();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const slide = slides[index];

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/85 backdrop-blur-xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      role="dialog"
      aria-modal="true"
      aria-label={`${t("stats.recap.title")}: ${label}`}
    >
      {slide && (
        <SideButton label={t("stats.recap.previous")} onClick={previous} disabled={index === 0}>
          <LeftLine size={22} />
        </SideButton>
      )}

      <motion.div
        className="relative h-full w-full overflow-hidden bg-zinc-950 text-white sm:h-[min(92vh,860px)] sm:w-auto sm:aspect-[9/16] sm:rounded-[28px] sm:shadow-2xl"
        initial={{ scale: 0.94, y: 24 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        {slide ? (
          <>
            <AnimatePresence initial={false}>
              <motion.div
                key={index}
                className="absolute inset-0"
                initial={{ opacity: 0, scale: 1.04 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45 }}
              >
                <RecapSlideView slide={slide} periodLabel={label} covers={covers} />
              </motion.div>
            </AnimatePresence>

            <div
              className="absolute inset-0 z-10 select-none"
              onPointerDown={() => {
                pressedAt.current = Date.now();
                setPaused(true);
              }}
              onPointerUp={(event) => {
                setPaused(false);
                if (Date.now() - pressedAt.current > TAP_MS) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                if (event.clientX - bounds.left < bounds.width / 3) previous();
                else next();
              }}
              onPointerCancel={() => setPaused(false)}
              onPointerLeave={() => setPaused(false)}
              aria-hidden
            />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-[32px] text-center text-[15px] text-white/80" style={font}>
            {isLoading ? (
              <span className="h-[28px] w-[28px] animate-spin rounded-full border-2 border-white/25 border-t-white" aria-label={t("common.loading")} />
            ) : error ? (
              t("stats.load_error")
            ) : (
              t("stats.empty")
            )}
          </div>
        )}

        <div className="absolute inset-x-0 top-0 z-20 px-[12px] pt-[max(12px,env(safe-area-inset-top))]">
          <div className="flex gap-[4px]">
            {slides.map((_, position) => (
              <span key={position} className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
                {position < index && <span className="absolute inset-0 bg-white" />}
                {position === index && (
                  <span
                    key={index}
                    className="recap-progress absolute inset-0 bg-white"
                    style={{ "--recap-slide-ms": `${SLIDE_MS}ms`, animationPlayState: paused ? "paused" : "running" } as CSSProperties}
                    onAnimationEnd={next}
                  />
                )}
              </span>
            ))}
          </div>
          <div className="mt-[10px] flex items-center justify-between">
            <span className="text-[14px] font-[700] text-white drop-shadow" style={font}>
              {t("stats.recap.title")} · {label}
            </span>
            <span className="flex items-center gap-[4px]">
              {slide && (
                <IconButton label={paused ? t("stats.recap.resume") : t("stats.recap.pause")} onClick={() => setPaused(!paused)}>
                  {paused ? <PlayFill size={18} /> : <PauseFill size={18} />}
                </IconButton>
              )}
              <IconButton label={t("common.close")} onClick={onClose}>
                <CloseLine size={20} />
              </IconButton>
            </span>
          </div>
        </div>
      </motion.div>

      {slide && (
        <SideButton label={t("stats.recap.next")} onClick={next}>
          <RightLine size={22} />
        </SideButton>
      )}
    </motion.div>,
    document.body,
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="w-[36px] h-[36px] inline-flex items-center justify-center rounded-full border-0 bg-black/25 text-white cursor-pointer backdrop-blur-md hover:bg-black/40"
    >
      {children}
    </button>
  );
}

/** Desktop arrows beside the story; on a phone the story fills the screen and taps do this. */
function SideButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="max-sm:hidden mx-[20px] w-[44px] h-[44px] inline-flex items-center justify-center rounded-full border-0 bg-white/10 text-white enabled:cursor-pointer enabled:hover:bg-white/20 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
