import { memo, useEffect, useRef, useState } from "react";
import { More2Fill, RepeatFill } from "@mingcute/react";
import DropdownMenu from "@/shared/ui/DropdownMenu";
import type { DropdownMenuItem } from "@/shared/ui/DropdownMenu";
import { useTranslation } from "@/languages";
import { ArtistLink } from "@/features/artist";
import ExplicitBadge from "@/shared/ui/ExplicitBadge";
import NowPlayingBars from "@/shared/ui/NowPlayingBars";
import CoverImage from "@/features/covers/ui/CoverImage";
import { isCoverReady } from "@/features/covers/lib/coverArt";
import type { TrackArtist } from "@/shared/types";

export interface SongCardProps {
  id?: string;
  title: string;
  artists?: string;
  artistId?: string;
  artistList?: TrackArtist[];
  artistsClickable?: boolean;
  coverUrl: string;
  className?: string;
  onPlay?: () => void;
  onDoubleClick?: () => void;
  duration?: string;
  releaseDate?: string;
  explicit?: boolean;
  /** Rendered before the artists line, e.g. a download marker. */
  badge?: React.ReactNode;
  imageShape?: "square" | "circle";
  trackNumber?: number;
  repostedBy?: string;
  menuItems?: DropdownMenuItem[];
  menuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
  menuPosition?: { x: number; y: number } | null;
  onContextMenu?: (e: React.MouseEvent) => void;
  onNavigate?: () => void;
  compact?: boolean;
  icon?: React.ReactNode;
  showReorderHandle?: boolean;
  onGrabStart?: (e: React.PointerEvent<HTMLDivElement>) => void;
  /** Touch and hold; phones open the track menu with it. */
  onLongPress?: () => void;
  /** Whether this is the track in the player right now. */
  playState?: "none" | "playing" | "paused";
}

const LONG_PRESS_MS = 450;
const LONG_PRESS_SLOP_PX = 10;
const INTERACTIVE_TARGETS = "button, a, [role='menuitem'], [data-prevent-drag]";

function SongCard({
  title,
  artists,
  artistId,
  artistList,
  artistsClickable = true,
  coverUrl,
  className,
  onPlay,
  onDoubleClick,
  duration,
  releaseDate,
  explicit = false,
  badge,
  imageShape = "square",
  trackNumber,
  repostedBy,
  menuItems,
  menuOpen,
  onMenuOpenChange,
  menuPosition,
  onContextMenu,
  onNavigate,
  compact = false,
  icon,
  showReorderHandle,
  onGrabStart,
  onLongPress,
  playState = "none",
}: SongCardProps) {
  const { t } = useTranslation();
  const [imageLoaded, setImageLoaded] = useState(() => isCoverReady(coverUrl));
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressRef = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const longPressedRef = useRef(false);
  const isCurrent = playState !== "none";

  const cancelLongPress = () => {
    if (longPressRef.current) clearTimeout(longPressRef.current.timer);
    longPressRef.current = null;
  };

  useEffect(() => cancelLongPress, []);

  useEffect(() => {
    setImageLoaded(isCoverReady(coverUrl));
  }, [coverUrl]);

  const imageSizeClass = compact ? "h-[40px] w-[40px]" : "h-[48px] w-[48px]";
  const titleSizeClass = compact ? "text-[14px]" : "text-[16px]";
  const artistSizeClass = compact ? "text-[12px]" : "text-[15px]";
  const gapClass = compact ? "gap-[12px]" : "gap-[16px]";
  const paddingClass = compact ? "p-[6px]" : "p-[8px]";

  const handleClick = (e: React.MouseEvent) => {
    if (longPressedRef.current) {
      longPressedRef.current = false;
      return;
    }
    if (typeof window !== "undefined" && window.__waveWasDragging) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    if (!onPlay) return;
    if (!onDoubleClick) {
      onPlay();
      return;
    }

    const detail = (e as React.MouseEvent<HTMLDivElement>).detail;
    if (detail >= 2) {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      onDoubleClick();
      return;
    }

    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      if (typeof window !== "undefined" && window.__waveWasDragging) return;
      onPlay();
    }, 200);
  };

  return (
    <div
      data-track-item
      className={`group w-full flex items-center justify-between rounded-md ${paddingClass} outline-none transition-colors duration-150 ease-out max-md:select-none [-webkit-touch-callout:none] ${
        className ?? ""
      } ${onPlay ? "cursor-pointer" : ""} ${onPlay && !className?.includes("hover:bg-") ? "hover:bg-border-alpha-14" : ""}`}
      onClick={handleClick}
      onPointerDown={(e) => {
        if (clickTimerRef.current) {
          clearTimeout(clickTimerRef.current);
          clickTimerRef.current = null;
        }
        const target = e.target as HTMLElement;
        if (target.closest(INTERACTIVE_TARGETS)) return;
        longPressedRef.current = false;
        if (e.pointerType === "touch" && onLongPress) {
          cancelLongPress();
          longPressRef.current = {
            x: e.clientX,
            y: e.clientY,
            timer: setTimeout(() => {
              longPressRef.current = null;
              longPressedRef.current = true;
              navigator.vibrate?.(10);
              onLongPress();
            }, LONG_PRESS_MS),
          };
        }
        if (e.clientY <= 32) return;
        if (!onGrabStart) return;
        onGrabStart(e);
      }}
      onPointerMove={(e) => {
        const press = longPressRef.current;
        if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > LONG_PRESS_SLOP_PX) cancelLongPress();
      }}
      onPointerUp={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onContextMenu={(e) => {
        // the hold already opened the menu; the WebView's own long-press menu must not follow
        if (longPressedRef.current || longPressRef.current) {
          e.preventDefault();
          return;
        }
        onContextMenu?.(e);
      }}
      onKeyDown={(event) => {
        if (!onPlay) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPlay();
        }
      }}
      role={onPlay ? "button" : undefined}
      tabIndex={onPlay ? 0 : undefined}
    >
      <div className={`flex items-center ${gapClass} min-w-0`}>
        {trackNumber !== undefined ? (
          <div
            className={`flex ${imageSizeClass} shrink-0 items-center justify-center ${titleSizeClass} text-text-tertiary`}
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontWeight: 400,
            }}
          >
            {isCurrent ? <NowPlayingBars playing={playState === "playing"} /> : trackNumber}
          </div>
        ) : (
          <div
            className={`relative ${imageSizeClass} shrink-0 overflow-hidden bg-bg-panel flex items-center justify-center ${
              imageShape === "circle" ? "rounded-full" : "rounded-md"
            }`}
          >
            {icon ? (
              icon
            ) : (
              <CoverImage
                key={coverUrl}
                src={coverUrl}
                alt={title}
                fill
                sizes={compact ? "40px" : "48px"}
                placeholder="empty"
                onLoadStart={() => setImageLoaded(isCoverReady(coverUrl))}
                onLoad={() => setImageLoaded(true)}
                className={`object-cover pointer-events-none transition-opacity duration-300 ${
                  imageLoaded ? "opacity-100" : "opacity-0"
                }`}
                draggable={false}
              />
            )}
            {isCurrent && !icon && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/45">
                <NowPlayingBars playing={playState === "playing"} />
              </span>
            )}
          </div>
        )}

        <div className="min-w-0 flex flex-col gap-[2px]">
          <div className="flex items-center gap-[8px]">
            <h3
              className={`m-0 max-w-[min(52vw,560px)] overflow-hidden text-ellipsis whitespace-nowrap ${titleSizeClass} leading-[1.2] ${
                isCurrent ? "text-accent-primary" : "text-text-primary"
              }`}
              style={{
                fontFamily: "var(--font-inter), sans-serif",
                fontWeight: 400,
              }}
              title={title}
            >
              {title}
            </h3>
            {repostedBy && (
              <div
                className="flex items-center gap-[4px] text-text-tertiary text-[13px]"
                title={t("common.reposted_by", { name: repostedBy })}
              >
                <RepeatFill size={14} />
                <span>{repostedBy}</span>
              </div>
            )}
          </div>
          <p
            className={`m-0 flex min-w-0 items-center ${artistSizeClass} leading-[1.2] text-text-secondary overflow-hidden`}
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontWeight: 350,
            }}
          >
            {badge}
            {explicit && <ExplicitBadge size="md" className="mr-[6px] shrink-0" />}
            {artistsClickable ? (
              <ArtistLink
                name={artists}
                artistId={artistId}
                artistList={artistList}
                onNavigate={onNavigate}
                className="text-text-secondary"
              />
            ) : (
              <span className="truncate select-none">{artists}</span>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center shrink-0 ml-[16px] gap-[16px]">
        {releaseDate && (
          <span
            className="text-[14px] text-text-tertiary"
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontWeight: 400,
            }}
          >
            {releaseDate}
          </span>
        )}
        {duration && (
          <span
            className="text-[14px] text-text-tertiary"
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontWeight: 400,
            }}
          >
            {duration}
          </span>
        )}
        {menuItems && menuItems.length > 0 && (
          <DropdownMenu
            trigger={
              <button
                type="button"
                aria-label={t("common.more_options")}
                className="rounded-md bg-transparent border-0 p-0 text-text-primary transition-all duration-200 active:scale-[0.96] flex items-center justify-center cursor-pointer"
              >
                <More2Fill size={22} />
              </button>
            }
            items={menuItems}
            open={menuOpen}
            onOpenChange={onMenuOpenChange}
            position={menuPosition}
            header={
              <div className="flex items-center gap-[12px] px-[20px] pt-[4px] pb-[12px]">
                <div
                  className={`relative h-[44px] w-[44px] shrink-0 overflow-hidden bg-bg-panel ${
                    imageShape === "circle" ? "rounded-full" : "rounded-md"
                  }`}
                >
                  {coverUrl && <CoverImage src={coverUrl} alt="" fill sizes="44px" className="object-cover" draggable={false} />}
                </div>
                <div className="flex min-w-0 flex-col gap-[2px]" style={{ fontFamily: "var(--font-inter), sans-serif" }}>
                  <span className="truncate text-[16px] text-text-primary">{title}</span>
                  {artists && <span className="truncate text-[14px] text-text-secondary">{artists}</span>}
                </div>
              </div>
            }
          />
        )}
      </div>
    </div>
  );
}

export default memo(SongCard);
