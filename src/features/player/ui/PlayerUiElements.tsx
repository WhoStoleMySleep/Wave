import {
  Play,
  Pause,
  SkipNext,
  SkipPrevious,
  Repeat,
  RepeatOne,
  Shuffle,
  MusicNote,
} from "@solar-icons/react";
import { AddLine, CheckFill, SparklesFill } from "@mingcute/react";
import { usePlayerState } from "../hooks/usePlayerState";
import { useSaveTrackAction } from "../hooks/useSaveTrackAction";
import { playerEngine } from "../engine/playerEngine";
import { AnimatePresence, motion } from "framer-motion";
import { ArtistLink } from "@/features/artist";
import { useCoverReady, CoverImage } from "@/features/covers";
import ExplicitBadge from "@/shared/ui/ExplicitBadge";
import Tooltip from "@/shared/ui/Tooltip";
import { VolumePicker } from "./VolumePicker";
import { PlaybackTimeline } from "./TimelineSlider";

import { useTranslation } from "@/languages";
import { useIsMobile } from "@/shared/hooks";

// a phone gives the player the whole screen, so it scales to the width instead of the desktop pane
const MOBILE_WIDTH = "w-[min(calc(100vw-48px),380px)]";

const iconButtonClass =
  "inline-flex h-[28px] w-[28px] items-center justify-center text-white opacity-70 transition duration-150 ease-out hover:opacity-100 active:scale-[0.94] shrink-0 border-none bg-transparent cursor-pointer";

function PlayPauseIcon({ status, size = 22 }: { status: string; size?: number }) {
  if (status === "loading") {
    return (
      <span
        className="animate-spin rounded-full border-[2px] border-current border-t-transparent"
        style={{ width: size * 0.8, height: size * 0.8 }}
        aria-label="Loading playback"
      />
    );
  }
  return status === "playing" ? (
    <Pause weight="Bold" size={size} />
  ) : (
    <Play weight="Bold" size={size} className="translate-x-[1px]" />
  );
}

interface PlayerUiElementsProps {
  onDuration?: (duration: number) => void;
  onClose?: () => void;
}

export function PlayerUiElements({
  onDuration: _onDuration,
  onClose,
}: PlayerUiElementsProps) {
  const player = usePlayerState({ position: false });

  const track = player.currentTrack;
  const coverUrl = track?.coverUrl || "";
  const trackTitle = track?.title || "";
  const trackArtists = track?.artists || "";

  const { saved: isLiked, press: handleLikeToggle } = useSaveTrackAction(track);

  const isCoverLoaded = useCoverReady(coverUrl);

  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const iconButton = isMobile ? `${iconButtonClass} !h-[48px] !w-[48px]` : iconButtonClass;

  return (
    <>
      {/* Artwork (Compact, flat, no drop shadows) */}
      <div
        data-track-swipe
        className={`relative shrink-0 overflow-hidden rounded-xl ${isMobile ? `${MOBILE_WIDTH} aspect-square` : "w-[280px] h-[280px]"} bg-black/20 ${
          coverUrl && !isCoverLoaded ? "animate-pulse" : ""
        }`}
      >
        <AnimatePresence>
          <motion.div
            key={track?.id || coverUrl || "empty"}
            initial={{ opacity: 0, filter: "blur(8px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: "blur(8px)" }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute inset-0"
          >
            {coverUrl ? (
              <CoverImage
                key={coverUrl}
                src={coverUrl}
                alt={trackTitle}
                fill
                sizes={isMobile ? "380px" : "280px"}
                priority
                unoptimized
                className="rounded-xl object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-white/5 text-white/40">
                <MusicNote size={64} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
        {/* tooltip wrapper positioned on cover corner */}
        <Tooltip
          content={isLiked ? t("player.saved_where") : t("player.save")}
          side="top"
          wrapperClassName="!absolute bottom-2.5 left-2.5 z-20"
        >
          <button
            type="button"
            aria-label={isLiked ? t("player.saved_where") : t("player.save")}
            className={`relative inline-flex h-[30px] w-[30px] items-center justify-center rounded-full transition duration-200 ease-out active:scale-[0.92] bg-black/40 backdrop-blur-md border-none ${
              isLiked
                ? "text-white hover:bg-black/60"
                : "text-white/70 hover:text-white hover:bg-black/60"
            }`}
            onClick={handleLikeToggle}
            style={{ cursor: "pointer" }}
          >
            <motion.div
              initial={false}
              animate={{
                scale: isLiked ? 1 : 0.5,
                opacity: isLiked ? 1 : 0,
                rotate: isLiked ? 0 : -45,
              }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <CheckFill size={16} />
            </motion.div>
            <motion.div
              initial={false}
              animate={{
                scale: !isLiked ? 1 : 0.5,
                opacity: !isLiked ? 1 : 0,
                rotate: !isLiked ? 0 : 45,
              }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <AddLine size={16} />
            </motion.div>
          </button>
        </Tooltip>
      </div>

      {/* Track info */}
      <div data-track-swipe className={`${isMobile ? MOBILE_WIDTH : "w-[280px]"} flex items-start justify-center min-w-0`}>
        <div className="flex flex-col gap-[2px] min-w-0 text-center">
          <p
            className={`m-0 ${isMobile ? "text-[20px] max-w-full" : "text-[15px] max-w-[280px]"} font-[600] text-white flex items-center justify-center gap-[6px]`}
            style={{ letterSpacing: "-0.03em" }}
          >
            <span className="min-w-0 truncate">{trackTitle}</span>
          </p>
          <p className={`m-0 flex items-center justify-center gap-[5px] ${isMobile ? "text-[15px] max-w-full" : "text-[12px] max-w-[320px]"} text-white/60 leading-snug overflow-hidden`}>
            {track?.explicit && (
              <ExplicitBadge className="!bg-white/60 !text-black !pb-0 !leading-none shrink-0" />
            )}
            <ArtistLink
              name={trackArtists}
              artistId={track?.artistId}
              artistList={track?.artistList}
              linkOnMobile
              onNavigate={() => {
                if (location.pathname !== "/player") {
                  onClose?.();
                }
              }}
              className="text-white/60"
            />
          </p>
        </div>
      </div>

      {/* Timeline (Compact, with smooth spring pill, no thumb) */}
      <PlaybackTimeline
        durationMs={player.durationMs}
        onSeek={(pos) => playerEngine.seek(pos)}
        showTime
        size={isMobile ? "lg" : "md"}
        className={isMobile ? MOBILE_WIDTH : "w-[320px]"}
      />

      {/* Primary Playback Controls */}
      <div className={`flex items-center ${isMobile ? "gap-[18px]" : "gap-[14px]"}`}>
        <button
          type="button"
          aria-label="Shuffle"
          title={
            player.smartShuffle
              ? t("player.smart_shuffle_on")
              : player.shuffle
                ? t("player.shuffle_on")
                : t("player.shuffle_off")
          }
          onClick={() => playerEngine.cycleShuffleMode()}
          className={`relative ${iconButton} ${
            player.shuffle ? "!text-white !opacity-100" : "!text-white/40"
          }`}
        >
          <Shuffle size={isMobile ? 24 : 18} weight={player.shuffle ? "Bold" : "Outline"} />
          {player.smartShuffle && (
            <SparklesFill
              size={isMobile ? 11 : 8}
              className={`absolute ${isMobile ? "right-[8px] top-[9px]" : "-right-[2px] top-0"}`}
            />
          )}
        </button>

        <button
          type="button"
          aria-label="Previous track"
          onClick={() => void playerEngine.skipPrevious()}
          className={iconButton}
        >
          <SkipPrevious size={isMobile ? 30 : 20} weight="Bold" />
        </button>

        <button
          type="button"
          aria-label={player.status === "playing" ? "Pause" : "Play"}
          onClick={() => void playerEngine.togglePlayPause()}
          className={`inline-flex ${isMobile ? "h-[64px] w-[64px]" : "h-[36px] w-[36px]"} items-center justify-center text-white opacity-85 transition duration-150 ease-out hover:opacity-100 active:scale-[0.94] shrink-0 border-none bg-transparent cursor-pointer`}
        >
          <PlayPauseIcon status={player.status} size={isMobile ? 40 : 22} />
        </button>

        <button
          type="button"
          aria-label="Next track"
          onClick={() => void playerEngine.skipNext()}
          className={iconButton}
        >
          <SkipNext size={isMobile ? 30 : 20} weight="Bold" />
        </button>

        <button
          type="button"
          aria-label="Repeat"
          onClick={() =>
            playerEngine.setRepeat(
              player.repeat === "off"
                ? "all"
                : player.repeat === "all"
                  ? "one"
                  : "off",
            )
          }
          className={`${iconButton} ${
            player.repeat !== "off" ? "!text-white !opacity-100" : "!text-white/40"
          }`}
        >
          {player.repeat === "one" ? (
            <RepeatOne size={isMobile ? 24 : 18} />
          ) : (
            <Repeat size={isMobile ? 24 : 18} />
          )}
        </button>
      </div>

      {/* a phone has hardware volume keys, so the slider would only be a second, conflicting control */}
      {!isMobile && <VolumePicker className="w-[180px]" size="sm" />}
    </>
  );
}

export default PlayerUiElements;
