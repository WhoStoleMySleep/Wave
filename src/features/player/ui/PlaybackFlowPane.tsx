import { useLayoutEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useShallow } from "zustand/react/shallow";
import { MusicNote } from "@solar-icons/react";
import { SparklesFill, WaveFill } from "@mingcute/react";
import { usePlayerStore } from "../store/playerStore";
import { playerEngine } from "../engine/playerEngine";
import { CoverImage } from "@/features/covers";
import { useTranslation } from "@/languages";
import type { Track } from "@/shared/types";

const ROW_HEIGHT = 60;
const HEADER_HEIGHT = 36;

type FlowItem =
  | { kind: "track"; track: Track; index: number }
  | { kind: "header"; label: string };

/**
 * The phone's «flow»: the whole queue around the current track, played ones
 * dimmed above it, what comes next below, with the tracks the player brought
 * in itself (wave, smart shuffle) marked. Tapping a row jumps there.
 */
export function PlaybackFlowPane() {
  const { t } = useTranslation();
  const { queue, currentIndex } = usePlayerStore(
    useShallow((s) => ({
      queue: s.queue,
      currentIndex: s.currentIndex,
    })),
  );

  const items = useMemo<FlowItem[]>(() => {
    const rows: FlowItem[] = [];
    queue.forEach((track, index) => {
      rows.push({ kind: "track", track, index });
      if (index === currentIndex && index < queue.length - 1) {
        rows.push({ kind: "header", label: t("player.up_next") });
      }
    });
    return rows;
  }, [queue, currentIndex, t]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (items[i]?.kind === "header" ? HEADER_HEIGHT : ROW_HEIGHT),
    overscan: 8,
  });

  // one played track stays in view above the current one, so the list reads as "was, is, next"
  useLayoutEffect(() => {
    if (currentIndex < 0) return;
    virtualizer.scrollToIndex(Math.max(0, currentIndex - 1), { align: "start" });
    // only on opening; following every track change would yank the list while the user scrolls it
  }, []);

  if (queue.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-[15px] text-white/50">
        {t("player.queue_empty")}
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y px-3 pb-4">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => {
          const item = items[row.index];
          if (!item) return null;
          const style = {
            position: "absolute" as const,
            top: 0,
            left: 0,
            width: "100%",
            height: row.size,
            transform: `translateY(${row.start}px)`,
          };
          if (item.kind === "header") {
            return (
              <div
                key={`header-${row.index}`}
                style={style}
                className="flex items-end px-2 pb-[6px] text-[12px] font-[600] uppercase tracking-[0.06em] text-white/45"
              >
                {item.label}
              </div>
            );
          }
          const { track, index } = item;
          const isCurrent = index === currentIndex;
          const isPlayed = index < currentIndex;
          return (
            <button
              key={`${track.playlistItemId ?? track.id}-${index}`}
              type="button"
              style={style}
              onClick={() => (isCurrent ? undefined : void playerEngine.playFromQueue(index))}
              className={`flex items-center gap-3 rounded-lg border-none px-2 text-left transition-colors active:bg-white/10 ${
                isCurrent ? "bg-white/12" : "bg-transparent"
              } ${isPlayed ? "opacity-45" : ""}`}
            >
              <div className="relative h-[44px] w-[44px] shrink-0 overflow-hidden rounded-md bg-white/5">
                {track.coverUrl ? (
                  <CoverImage src={track.coverUrl} alt={track.title} fill sizes="44px" className="object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-white/40">
                    <MusicNote size={20} />
                  </div>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                <span className={`truncate text-[15px] ${isCurrent ? "font-[600] text-white" : "text-white/90"}`}>
                  {track.title}
                </span>
                <span className="truncate text-[13px] text-white/55">{track.artists}</span>
              </div>
              {track.queueSource && (
                <span
                  className="inline-flex shrink-0 items-center gap-[4px] rounded-full bg-white/10 px-[8px] py-[3px] text-[11px] font-[500] text-white/70"
                  title={track.queueSource === "smart" ? t("player.smart_pick") : t("player.wave")}
                >
                  {track.queueSource === "smart" ? <SparklesFill size={11} /> : <WaveFill size={11} />}
                  {track.queueSource === "smart" ? t("player.smart_pick") : t("player.wave")}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
