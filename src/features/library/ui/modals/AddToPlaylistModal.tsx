import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import {
  PlaylistFill,
  Search2Line,
  CloseCircleFill,
  AddLine,
  CheckFill,
  HeartFill,
} from "@mingcute/react";
import { useToast } from "@/shared/ui";
import { ApiError } from "@/shared/api";
import TextInput from "@/shared/ui/TextInput";
import Dialog from "@/shared/ui/Dialog";
import CoverImage from "@/features/covers/ui/CoverImage";
import { useTranslation } from "@/languages";
import {
  addTrackToPlaylist,
  likeTrack,
  removeTrackFromPlaylist,
  unlikeTrack,
  useAddPlaylistTracks,
  useIsTrackLiked,
  useLikedTrackCount,
  usePlaylistsList,
  useTrackMemberships,
} from "../../hooks";
import { useModalStore } from "../../store/modalStore";

const font = { fontFamily: "var(--font-inter), sans-serif" } as const;

/** Row id of the likes in manage mode; playlist ids are UUIDs, so it can't collide. */
const LIKES_ROW = "likes";

interface PlaylistRow {
  id: string;
  title: string;
  description?: string;
  coverUrl: string;
  trackCount: number;
}

export default function AddToPlaylistModal() {
  const { toast } = useToast();
  const { t } = useTranslation();

  const open = useModalStore((state) => state.addToPlaylistOpen);
  const track = useModalStore((state) => state.addToPlaylistTrack);
  const close = useModalStore((state) => state.closeAddToPlaylist);
  const openCreatePlaylist = useModalStore((state) => state.openCreatePlaylist);
  const mode = useModalStore((state) => state.addToPlaylistMode);
  const managing = mode === "manage";

  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [scrollMask, setScrollMask] = useState(
    "linear-gradient(to bottom, black 0%, black 100%)",
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const { data: playlistData } = usePlaylistsList();
  const addTrack = useAddPlaylistTracks();

  const memberships = useTrackMemberships(managing && open ? track?.id : undefined);
  const isLiked = useIsTrackLiked(managing && open ? track?.id : undefined);
  const { data: likedCount } = useLikedTrackCount();

  const rawPlaylists: PlaylistRow[] = useMemo(() => {
    const own = track?.playlists ?? playlistData?.playlists ?? [];
    if (!managing) return own;
    const likes: PlaylistRow = {
      id: LIKES_ROW,
      title: t("library.liked_songs"),
      coverUrl: "",
      trackCount: likedCount,
    };
    return [likes, ...own];
  }, [track?.playlists, playlistData?.playlists, managing, likedCount, t]);

  const isSaved = useCallback(
    (playlistId: string) =>
      playlistId === LIKES_ROW ? isLiked : (memberships?.has(playlistId) ?? false),
    [isLiked, memberships],
  );

  // Taken once per opening: rows jumping between the groups while the user taps them would be impossible to aim at.
  const [savedOnOpen, setSavedOnOpen] = useState<ReadonlySet<string> | null>(null);
  useEffect(() => {
    if (!open || !managing) {
      setSavedOnOpen(null);
      return;
    }
    if (savedOnOpen || !memberships) return;
    setSavedOnOpen(new Set([...(isLiked ? [LIKES_ROW] : []), ...memberships.keys()]));
  }, [open, managing, memberships, isLiked, savedOnOpen]);

  const playlists = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const matching = q
      ? rawPlaylists.filter(
          (p) =>
            p.title.toLowerCase().includes(q) ||
            (p.description ? p.description.toLowerCase().includes(q) : false),
        )
      : rawPlaylists;
    if (!managing || !savedOnOpen) return matching;
    return [
      ...matching.filter((p) => savedOnOpen.has(p.id)),
      ...matching.filter((p) => !savedOnOpen.has(p.id)),
    ];
  }, [rawPlaylists, searchQuery, managing, savedOnOpen]);

  const dividerAfter = useMemo(() => {
    if (!managing || !savedOnOpen) return -1;
    const savedCount = playlists.filter((p) => savedOnOpen.has(p.id)).length;
    return savedCount > 0 && savedCount < playlists.length ? savedCount - 1 : -1;
  }, [managing, savedOnOpen, playlists]);

  // update dynamic top and bottom scroll fade mask
  const updateScrollMask = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, clientHeight, scrollHeight } = el;
    const showTop = scrollTop > 4;
    const showBottom = scrollTop + clientHeight < scrollHeight - 4;

    let stops = "";
    if (showTop) stops += "transparent 0%, black 6%, ";
    else stops += "black 0%, black 6%, ";
    if (showBottom) stops += "black 94%, transparent 100%";
    else stops += "black 94%, black 100%";

    setScrollMask(`linear-gradient(to bottom, ${stops})`);
  }, []);

  useEffect(() => {
    if (!open) {
      setSearchQuery("");
    }
  }, [open]);

  useEffect(() => {
    if (rawPlaylists.length >= 5) {
      updateScrollMask();
    }
  }, [open, rawPlaylists.length, playlists.length, updateScrollMask]);

  const handleAddToPlaylist = async (playlistId: string) => {
    if (!track) return;
    const targetPlaylist = playlists.find((p) => p.id === playlistId);
    setAddingTo(playlistId);
    try {
      await addTrack.mutateAsync({ playlistId, trackId: track.id });
      toast(t("common.added_to_playlist"), "checkmark", {
        description: targetPlaylist?.title || undefined,
      });
      close();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        toast(t("common.track_already_in_playlist"), "error", {
          description: track.title || undefined,
        });
      } else {
        toast(t("common.failed_add_playlist"), "error");
      }
    } finally {
      setAddingTo(null);
    }
  };

  const handleToggle = async (playlistId: string) => {
    if (!track) return;
    const saved = isSaved(playlistId);
    setAddingTo(playlistId);
    try {
      if (playlistId === LIKES_ROW) {
        await (saved ? unlikeTrack(track.id) : likeTrack(track.id));
      } else if (saved) {
        await removeTrackFromPlaylist(playlistId, track.id);
      } else {
        await addTrackToPlaylist(playlistId, track.id);
      }
    } catch {
      toast(t(saved ? "common.failed_remove_playlist" : "common.failed_add_playlist"), "error");
    } finally {
      setAddingTo(null);
    }
  };

  const handleNewPlaylist = () => {
    const pendingTrack = track;
    close();
    openCreatePlaylist(undefined, pendingTrack);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? close() : undefined)} maxWidth={400}>
      {/* outer gutters live here (12px); rows bleed only 8px on hover so
          cover art sits at the same 20px inset as the header text */}
      <div className="flex flex-col gap-[12px] px-[12px] pb-[12px]">
        <div className="px-[8px] pt-[4px]">
          <h2
            className="m-0 text-[18px] font-[600] tracking-[-0.01em] text-text-primary"
            style={font}
          >
            {managing ? t("common.save_to") : t("common.add_to_playlist")}
          </h2>
          {track && (
            <div className="mt-[10px] flex items-center gap-[10px] rounded-md bg-bg-elevated/60 px-[10px] py-[8px]">
              <div className="relative h-[40px] w-[40px] shrink-0 overflow-hidden rounded-md bg-bg-elevated flex items-center justify-center">
                {track.coverUrl ? (
                  <CoverImage
                    src={track.coverUrl}
                    alt={track.title}
                    fill
                    sizes="40px"
                    className="object-cover"
                  />
                ) : (
                  <span className="text-[15px] font-[600] text-text-tertiary" style={font}>
                    {track.title.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-[1px]">
                <span className="truncate text-[13px] font-[500] text-text-primary" style={font}>
                  {track.title}
                </span>
                <span className="truncate text-[12px] text-text-tertiary" style={font}>
                  {track.artists}
                </span>
              </div>
            </div>
          )}
        </div>

        {rawPlaylists.length >= 5 && (
          <div className="px-[8px]">
            <TextInput
              size="sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("library.search_playlists")}
              icon={<Search2Line size={16} />}
              rightSlot={
                searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="border-none bg-transparent p-0 text-text-tertiary hover:text-text-primary cursor-pointer flex items-center justify-center"
                  >
                    <CloseCircleFill size={15} />
                  </button>
                ) : null
              }
              className="!h-[36px] w-full rounded-md !border-transparent bg-bg-elevated text-[13px]"
            />
          </div>
        )}

        <div
          ref={scrollRef}
          onScroll={rawPlaylists.length >= 5 ? updateScrollMask : undefined}
          style={
            rawPlaylists.length >= 5
              ? {
                  WebkitMaskImage: scrollMask,
                  maskImage: scrollMask,
                }
              : undefined
          }
          className="flex flex-col gap-[2px] max-h-[300px] overflow-y-auto"
        >
          {playlists.length > 0 ? (
            playlists.map((playlist, index) => (
              <div key={playlist.id} className="contents">
              <button
                type="button"
                disabled={addingTo !== null || (managing && !savedOnOpen)}
                onClick={() =>
                  managing ? void handleToggle(playlist.id) : handleAddToPlaylist(playlist.id)
                }
                className="flex items-center gap-[12px] p-[8px] rounded-md transition-colors hover:bg-bg-elevated active:bg-border-alpha-14 text-left group w-full border-none bg-transparent cursor-pointer disabled:opacity-50"
              >
                <div className="relative h-[44px] w-[44px] rounded-lg bg-bg-elevated overflow-hidden shrink-0 flex items-center justify-center">
                  {playlist.id === LIKES_ROW && managing ? (
                    <HeartFill size={20} className="text-text-primary" />
                  ) : playlist.coverUrl ? (
                    <CoverImage
                      src={playlist.coverUrl}
                      alt={playlist.title}
                      fill
                      sizes="44px"
                      className="object-cover"
                    />
                  ) : (
                    <PlaylistFill size={20} className="text-text-tertiary" />
                  )}
                </div>

                <div className="flex flex-col gap-[1px] min-w-0 flex-1">
                  <span
                    className="text-[13px] font-[500] text-text-primary truncate"
                    style={font}
                  >
                    {playlist.title}
                  </span>
                  <span
                    className="text-[12px] text-text-tertiary tabular-nums"
                    style={font}
                  >
                    {t("common.tracks", { count: playlist.trackCount })}
                  </span>
                </div>

                {addingTo === playlist.id ? (
                  <span className="h-[14px] w-[14px] animate-spin rounded-full border-[2px] border-text-tertiary border-t-text-primary shrink-0" />
                ) : managing && isSaved(playlist.id) ? (
                  <span className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full bg-text-primary text-bg-primary">
                    <CheckFill size={14} />
                  </span>
                ) : managing ? (
                  <span className="h-[24px] w-[24px] shrink-0 rounded-full border-[1.5px] border-text-tertiary transition-colors group-hover:border-text-primary" />
                ) : (
                  <span className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full text-text-tertiary transition-colors group-hover:bg-border-alpha-14 group-hover:text-text-primary">
                    <AddLine size={18} />
                  </span>
                )}
              </button>
              {index === dividerAfter && (
                <div className="mx-[8px] my-[6px] h-px shrink-0 bg-border-primary" role="separator" />
              )}
              </div>
            ))
          ) : (
            <div className="mx-[8px] flex flex-col items-center gap-[8px] rounded-md bg-bg-elevated/60 px-[12px] py-[24px] text-center">
              <span className="flex h-[36px] w-[36px] items-center justify-center rounded-full bg-bg-elevated text-text-tertiary">
                <PlaylistFill size={18} />
              </span>
              <p className="m-0 text-[13px] text-text-secondary" style={font}>
                {searchQuery
                  ? t("common.try_another_search_clear")
                  : t("common.no_playlists_yet")}
              </p>
            </div>
          )}
        </div>

        <div className="px-[8px]">
          <button
            type="button"
            onClick={handleNewPlaylist}
            className="flex h-[36px] w-full items-center justify-center gap-[6px] rounded-md border border-border-primary bg-transparent text-[13px] font-[500] text-text-primary transition-colors hover:bg-bg-elevated cursor-pointer"
            style={font}
          >
            <AddLine size={16} />
            {t("library.create_playlist")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
