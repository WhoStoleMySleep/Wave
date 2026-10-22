import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SparklesFill } from "@mingcute/react";
import { useTranslation } from "@/languages";
import { isMobilePlatform } from "@/shared/hooks/useIsMobile";
import { prefetchListeningStats, useListeningMonths } from "../hooks/useListeningStats";
import { useSeenRecaps } from "../hooks/useSeenRecaps";
import { periodLabel, recapPeriods, type PeriodKey } from "../lib/periods";
import { isRecapSeason, offeredRecap } from "../lib/promo";
import { accentGlow, font } from "./StatsParts";
import RecapStories from "./recap/RecapStories";

/** Room for the window buttons, which sit in the same corner on a desktop. */
const WINDOW_CONTROLS_RIGHT = 114;
const EDGE_RIGHT = 16;

/**
 * The home page's way into a recap around the end of a season or a year.
 * It asks for the listening months only in those weeks and goes away once the
 * recap is watched to the end.
 */
export default function RecapPromo() {
  const [now] = useState(() => new Date());
  if (!isRecapSeason(now)) return null;
  return <OfferedRecap now={now} />;
}

function OfferedRecap({ now }: { now: Date }) {
  const { t, locale } = useTranslation();
  const { data: months } = useListeningMonths();
  const seen = useSeenRecaps();
  const [open, setOpen] = useState<PeriodKey | null>(null);
  const offered = useMemo(() => offeredRecap(recapPeriods(months, now), now, seen), [months, now, seen]);
  const close = useCallback(() => setOpen(null), []);

  useEffect(() => {
    if (offered) prefetchListeningStats(offered);
  }, [offered]);

  return (
    <>
      <AnimatePresence>
        {offered && (
          <motion.button
            type="button"
            onClick={() => setOpen(offered)}
            aria-label={`${t("stats.recap.title")}: ${periodLabel(offered, locale, (season) => t(`stats.season.${season}`))}`}
            className="absolute top-[18px] z-20 h-[32px] inline-flex items-center gap-[6px] overflow-hidden rounded-full border-0 bg-bg-elevated pl-[10px] pr-[14px] text-[13px] font-[600] text-text-primary ring-1 ring-border-alpha-14 cursor-pointer transition-shadow hover:ring-border-alpha-33"
            style={{ ...font, ...accentGlow(0, 50, 30), right: isMobilePlatform() ? EDGE_RIGHT : WINDOW_CONTROLS_RIGHT }}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <SparklesFill size={16} color="var(--accent-primary)" />
            <span className="max-md:hidden">{t("stats.recap.title")} ·</span>
            {periodLabel(offered, locale, (season) => t(`stats.season.${season}`))}
          </motion.button>
        )}
      </AnimatePresence>
      {open && <RecapStories period={open} onClose={close} />}
    </>
  );
}
