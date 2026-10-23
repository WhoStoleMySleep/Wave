import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useMemo,
  useSyncExternalStore,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search3Line,
  CloseCircleFill,
  GridFill,
  Music2Fill,
  User2Fill,
  AlbumFill,
  PlaylistFill,
} from "@mingcute/react";
import Sidebar from "./Sidebar";
import WindowControls from "./WindowControls";
import PageTransition from "./PageTransition";
import SlideUpOverlay from "./SlideUpOverlay";
import RightDrawer from "./RightDrawer";
import { useGlobalShortcuts } from "../hooks/useGlobalShortcuts";
import { useDisableButtonFocus } from "../hooks/useDisableButtonFocus";
import { useSwipeDismiss } from "../hooks/useSwipeDismiss";
import { useSearch } from "@/features/search";
import { mediaUrl, toClientTrack, toMaxQualityAvatarUrl } from "@/shared/api";
import {
  FullscreenPlayer,
  playerEngine,
  MiniPlayer,
  usePlayerStore,
} from "@/features/player";
import SearchResultsList from "@/features/search/ui/SearchResultsList";
import {
  SearchHistoryList,
  SearchSourceSwitch,
  useSearchHistoryStore,
  useSearchSourceStore,
} from "@/features/search";
import { useTranslation } from "@/languages";
import { useTheme } from "next-themes";
import {
  AddToPlaylistModal,
  AddToLibraryModal,
  RemoveFromPlaylistModal,
  RemoveFromLibraryModal,
  ImportLikesModal,
  ImportReviewModal,
  CreatePlaylistModal,
  useModalStore,
} from "@/features/library";
import { SettingsModal, useCustomizationStore, getBlockStyle } from "@/features/settings";
import { UpdateModal, UpdateToastBridge } from "@/features/updater";
import { OfflineBanner } from "@/features/connectivity";
import { HandoffBanner } from "@/features/devices";
import { TrackMatchModal } from "@/features/catalogs";
import { useIsMobile } from "@/shared/hooks";


interface AppFrameProps {
  children: React.ReactNode;
}

const RIGHT_DRAWER_WIDTH = 440;
const SIDEBAR_WIDTH = 58;
const SHELL_EDGE_GAP = 12;
const SEARCH_QUERY_CACHE_TTL_MS = 60_000;
// a swipe down closes the player once it is pulled this far or flicked this fast
const FULLSCREEN_DISMISS_OFFSET = 120;
const FULLSCREEN_DISMISS_VELOCITY = 600;
const LEGACY_LAYOUT_STORAGE_KEYS = [
  "wave_right_sidebar",
  "wave_sidebar_position",
  "wave_sidebar_width",
  "wave_queue_popup_open",
] as const;

export default function AppFrame({ children }: AppFrameProps) {
  const location = useLocation();
  const { pathname, search } = location;
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  const searchOpen = useModalStore((state) => state.searchOpen);
  const openSearch = useModalStore((state) => state.openSearch);
  const closeSearch = useModalStore((state) => state.closeSearch);
  const toggleSearch = useModalStore((state) => state.toggleSearch);
  const openSettings = useModalStore((state) => state.openSettings);

  const [searchQuery, setSearchQuery] = useState("");
  const [queuePopupOpen, setQueuePopupOpen] = useState(false);
  const [rightDrawerTab, setRightDrawerTabState] = useState<"queue" | "lyrics">(() => {
    if (typeof window === "undefined") return "queue";
    const saved = window.localStorage.getItem("wave_right_drawer_tab");
    return saved === "queue" || saved === "lyrics" ? saved : "queue";
  });
  const fullscreenPlayerOpen = usePlayerStore((state) => state.fullscreen);
  const setFullscreenPlayerOpen = usePlayerStore((state) => state.setFullscreen);
  const [fullscreenEffectsReady, setFullscreenEffectsReady] = useState(false);

  useEffect(() => {
    if (pathname === "/settings") {
      openSettings();
      navigate("/", { replace: true });
    }
  }, [pathname, openSettings, navigate]);

  useEffect(() => {
    if (!isMobile) return;
    // a long press on a track fires contextmenu and would open the desktop right-click menu;
    // album and playlist cards keep it, since it is their only way to reach the actions
    const suppress = (event: MouseEvent) => {
      if (!(event.target as HTMLElement | null)?.closest?.("[data-track-item]")) return;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("contextmenu", suppress, true);
    return () => document.removeEventListener("contextmenu", suppress, true);
  }, [isMobile]);

  useEffect(() => {
    for (const key of LEGACY_LAYOUT_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
  }, []);

  const handleQueuePopupToggle = useCallback((open: boolean) => {
    setQueuePopupOpen(open);
  }, []);

  const handleQueuePopupToggleRequest = useCallback(() => {
    setQueuePopupOpen((current) => !current);
  }, []);

  const shouldShowMiniPlayer = useSyncExternalStore(
    playerEngine.subscribe,
    () => {
      const state = playerEngine.getSnapshot();
      return state.currentTrack !== null && state.status !== "idle";
    },
    () => false,
  );

  const hasCurrentTrack = useSyncExternalStore(
    playerEngine.subscribe,
    () => playerEngine.getSnapshot().currentTrack !== null,
    () => false,
  );

  const appFrameRef = useRef<HTMLDivElement>(null);
  const queueDrawerRef = useRef<HTMLDivElement>(null);
  const searchPopupRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const prevLocationRef = useRef(pathname + search);

  useEffect(() => {
    if (prevLocationRef.current !== pathname + search) {
      prevLocationRef.current = pathname + search;
      if (searchOpen && searchQuery.trim().length === 0) {
        closeSearch();
      }
    }
  }, [pathname, search, searchOpen, searchQuery, closeSearch]);

  useLayoutEffect(() => {
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTop = 0;
      const innerScrollables = mainScrollRef.current.querySelectorAll(".overflow-y-auto");
      innerScrollables.forEach((el) => {
        el.scrollTop = 0;
      });
    }
  }, [pathname, search]);

  const updateSearchMask = useCallback(() => {
    const el = searchScrollRef.current;
    if (!el) return;
    const { scrollTop, clientHeight, scrollHeight } = el;
    const showTop = scrollTop > 1;
    const showBottom = scrollTop + clientHeight < scrollHeight - 1;

    let stops = "";
    if (showTop) stops += "transparent 0%, black 7%, ";
    else stops += "black 0%, black 7%, ";
    if (showBottom) stops += "black 93%, transparent 100%";
    else stops += "black 93%, black 100%";

    setSearchScrollMask(`linear-gradient(to bottom, ${stops})`);
  }, []);

  useEffect(() => {
    if (!searchOpen) {
      const timeoutId = setTimeout(() => {
        setSearchQuery("");
      }, SEARCH_QUERY_CACHE_TTL_MS);
      return () => clearTimeout(timeoutId);
    }
    const id = requestAnimationFrame(updateSearchMask);
    requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [searchOpen, updateSearchMask]);

  const miniPlayerContainerRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const searchScrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  type SearchFilterKey = "all" | "tracks" | "artists" | "albums" | "playlists";
  const filterKeys: SearchFilterKey[] = [
    "all",
    "tracks",
    "artists",
    "albums",
    "playlists",
  ];
  const filterLabels: Record<SearchFilterKey, string> = {
    all: t("common.all"),
    tracks: t("common.songs"),
    artists: t("common.artists"),
    albums: t("common.albums"),
    playlists: t("common.playlists"),
  };

  const [activeFilter, setActiveFilter] = useState<SearchFilterKey>("all");
  const isAllSearchFilter = activeFilter === "all";
  const isTrackSearchFilter = activeFilter === "tracks";
  const isArtistSearchFilter = activeFilter === "artists";
  const isAlbumSearchFilter = activeFilter === "albums";
  const isPlaylistSearchFilter = activeFilter === "playlists";
  const hasSearchQuery = searchQuery.trim().length > 0;
  const isFullscreenRoute = pathname === "/player";
  const isFullscreenPlayer = isFullscreenRoute || fullscreenPlayerOpen;
  const shellChildrenRef = useRef<React.ReactNode>(null);
  if (!isFullscreenRoute) {
    shellChildrenRef.current = children;
  }
  const isRightDrawerOpen =
    queuePopupOpen && !searchOpen && !isFullscreenPlayer;

  const openFullscreenPlayer = useCallback(() => {
    setFullscreenPlayerOpen(true);
  }, []);

  const closeFullscreenPlayer = useCallback(() => {
    setFullscreenPlayerOpen(false);
  }, []);

  const fullscreenSwipe = useSwipeDismiss({
    offset: FULLSCREEN_DISMISS_OFFSET,
    velocity: FULLSCREEN_DISMISS_VELOCITY,
    onDismiss: closeFullscreenPlayer,
  });

  const handleCloseFullscreen = useCallback(() => {
    if (fullscreenPlayerOpen) {
      setFullscreenPlayerOpen(false);
    } else if (isFullscreenRoute) {
      navigate("/", { replace: true });
    }
  }, [fullscreenPlayerOpen, isFullscreenRoute, navigate]);

  useEffect(() => {
    if (isFullscreenPlayer && !hasCurrentTrack) {
      handleCloseFullscreen();
    }
  }, [isFullscreenPlayer, hasCurrentTrack, handleCloseFullscreen]);

  const setRightDrawerTab = useCallback((tab: "queue" | "lyrics") => {
    setRightDrawerTabState(tab);
    localStorage.setItem("wave_right_drawer_tab", tab);
  }, []);

  const openRightPanel = useCallback(
    (tab: "queue" | "lyrics") => {
      setRightDrawerTab(tab);
      setQueuePopupOpen(true);
    },
    [setRightDrawerTab],
  );
  const closeRightPanel = useCallback(() => setQueuePopupOpen(false), []);

  const isBackNavigableRoute =
    pathname === "/artist" ||
    pathname === "/library/playlist" ||
    pathname === "/collection";
  const handleEscapeFallback = useCallback(() => {
    if (queuePopupOpen || searchOpen || isFullscreenPlayer) return false;
    if (!isBackNavigableRoute) return false;
    if (window.history.length > 1) navigate(-1);
    else navigate("/library");
    return true;
  }, [isBackNavigableRoute, queuePopupOpen, searchOpen, isFullscreenPlayer, navigate]);

  useDisableButtonFocus();

  useGlobalShortcuts({
    searchOpen,
    openSearch,
    closeSearch,
    rightPanelOpen: queuePopupOpen,
    rightPanelTab: rightDrawerTab,
    openRightPanel,
    closeRightPanel,
    fullscreenOpen: isFullscreenPlayer,
    openFullscreen: openFullscreenPlayer,
    closeFullscreen: handleCloseFullscreen,
    onEscapeFallback: handleEscapeFallback,
  });
  const [searchScrollMask, setSearchScrollMask] = useState(
    "linear-gradient(to bottom, black 0%, black 100%)",
  );
  const addHistoryItem = useSearchHistoryStore((state) => state.addItem);
  const historyItems = useSearchHistoryStore((state) => state.items);
  const searchSource = useSearchSourceStore((state) => state.source);
  const {
    items: allResults,
    loading: allLoading,
    hasLoaded: allHasLoaded,
    runNow: runAllSearchNow,
  } = useSearch(searchQuery, "all", {
    enabled: searchOpen && isAllSearchFilter,
    source: searchSource,
  });

  const {
    items: trackResults,
    loading: trackLoading,
    hasLoaded: trackHasLoaded,
    runNow: runTrackSearchNow,
  } = useSearch(searchQuery, "track", {
    enabled: searchOpen && isTrackSearchFilter,
    source: searchSource,
  });

  const {
    items: artistResults,
    loading: artistLoading,
    hasLoaded: artistHasLoaded,
    runNow: runArtistSearchNow,
  } = useSearch(searchQuery, "artist", {
    enabled: searchOpen && isArtistSearchFilter,
    source: searchSource,
  });

  const {
    items: albumResults,
    loading: albumLoading,
    hasLoaded: albumHasLoaded,
    runNow: runAlbumSearchNow,
  } = useSearch(searchQuery, "album", {
    enabled: searchOpen && isAlbumSearchFilter,
    source: searchSource,
  });

  const {
    items: playlistResults,
    loading: playlistLoading,
    hasLoaded: playlistHasLoaded,
    runNow: runPlaylistSearchNow,
  } = useSearch(searchQuery, "playlist", {
    enabled: searchOpen && isPlaylistSearchFilter,
    source: searchSource,
  });

  const searchResults = useMemo(() => {
    if (isAllSearchFilter) {
      return allResults.map((item: any) => {
        const coverUrl = item.cover
          ? mediaUrl(item.cover.url)
          : (item.coverUrl ?? "");
        if (item.type === "track") {
          const clientTrack = toClientTrack(item);
          return {
            ...clientTrack,
            ...item,
            _type: "track",
            coverUrl: clientTrack.coverUrl || coverUrl,
            artists: clientTrack.artists,
            artistId: clientTrack.artistId,
            artistList: clientTrack.artistList,
          };
        }
        if (item.type === "artist") {
          return {
            ...item,
            _type: "artist",
            title: item.name,
            coverUrl: toMaxQualityAvatarUrl(coverUrl),
            artists: "",
          };
        }
        if (item.type === "album") {
          return {
            ...item,
            _type: "album",
            coverUrl,
            artists: Array.isArray(item.artists)
              ? item.artists.map((a: any) => a.name).join(", ")
              : (item.artists ?? ""),
            artistId: item.artists?.[0]?.id,
            artistList: Array.isArray(item.artists)
              ? item.artists.map((a: any) => ({ id: a.id, name: a.name }))
              : undefined,
          };
        }
        return {
          ...item,
          _type: item.type,
          coverUrl,
          artists: item.author ?? item.artists ?? "",
          artistId: item.artists?.[0]?.id,
          artistList: Array.isArray(item.artists)
            ? item.artists.map((a: any) => ({ id: a.id, name: a.name }))
            : undefined,
        };
      });
    }
    if (isTrackSearchFilter)
      return trackResults.map((t: any) => {
        const clientTrack = toClientTrack(t);
        return {
          ...clientTrack,
          ...t,
          _type: "track",
          coverUrl:
            clientTrack.coverUrl ||
            (t.cover ? mediaUrl(t.cover.url) : (t.coverUrl ?? "")),
          artists: clientTrack.artists,
          artistId: clientTrack.artistId,
          artistList: clientTrack.artistList,
        };
      });
    if (isArtistSearchFilter)
      return artistResults.map((a: any) => ({
        ...a,
        _type: "artist",
        title: a.name,
        coverUrl: toMaxQualityAvatarUrl(a.cover ? mediaUrl(a.cover.url) : (a.coverUrl ?? "")),
      }));
    if (isAlbumSearchFilter)
      return albumResults.map((a: any) => ({
        ...a,
        _type: "album",
        coverUrl: a.cover ? mediaUrl(a.cover.url) : (a.coverUrl ?? ""),
        artists: Array.isArray(a.artists)
          ? a.artists.map((ar: any) => ar.name).join(", ")
          : (a.artists ?? ""),
        artistId: a.artists?.[0]?.id,
        artistList: Array.isArray(a.artists)
          ? a.artists.map((ar: any) => ({ id: ar.id, name: ar.name }))
          : undefined,
      }));
    if (isPlaylistSearchFilter)
      return playlistResults.map((p: any) => ({
        ...p,
        _type: "playlist",
        coverUrl: p.cover ? mediaUrl(p.cover.url) : (p.coverUrl ?? ""),
      }));
    return [];
  }, [
    isAllSearchFilter,
    isTrackSearchFilter,
    isArtistSearchFilter,
    isAlbumSearchFilter,
    isPlaylistSearchFilter,
    allResults,
    trackResults,
    artistResults,
    albumResults,
    playlistResults,
  ]);

  const searchLoading = isAllSearchFilter
    ? allLoading
    : isTrackSearchFilter
      ? trackLoading
      : isArtistSearchFilter
        ? artistLoading
        : isAlbumSearchFilter
          ? albumLoading
          : playlistLoading;

  const searchHasLoaded = isAllSearchFilter
    ? allHasLoaded
    : isTrackSearchFilter
      ? trackHasLoaded
      : isArtistSearchFilter
        ? artistHasLoaded
        : isAlbumSearchFilter
          ? albumHasLoaded
          : playlistHasLoaded;

  const isSearchEmpty =
    searchQuery.trim().length >= 2 &&
    !searchLoading &&
    searchHasLoaded &&
    searchResults.length === 0;

  const runSearchNow = () => {
    if (isAllSearchFilter) {
      runAllSearchNow();
      return;
    }
    if (isTrackSearchFilter) runTrackSearchNow();
    if (isArtistSearchFilter) runArtistSearchNow();
    if (isAlbumSearchFilter) runAlbumSearchNow();
    if (isPlaylistSearchFilter) runPlaylistSearchNow();
  };

  useEffect(() => {
    if (isFullscreenPlayer) {
      setQueuePopupOpen(false);
      closeSearch();
    }
  }, [isFullscreenPlayer, closeSearch]);

  useEffect(() => {
    const onGlobalPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (
        target instanceof Element &&
        (target.closest("[data-dialog-container]") ||
          target.closest("[data-dialog-backdrop]") ||
          target.closest("[data-dropdown-menu]"))
      ) {
        return;
      }
      if (searchOpen) {
        if (searchPopupRef.current?.contains(target)) {
          return;
        }
        if (sidebarRef.current?.contains(target)) {
          return;
        }
        closeSearch();
      }
      if (queuePopupOpen) {
        if (queueDrawerRef.current?.contains(target)) {
          return;
        }
        if (miniPlayerContainerRef.current?.contains(target)) {
          return;
        }
        if (sidebarRef.current?.contains(target)) {
          return;
        }
        if (
          event.clientY <= 32 ||
          (target instanceof Element && target.closest("[data-window-drag]"))
        ) {
          return;
        }
        if (queuePopupOpen) {
          handleQueuePopupToggle(false);
        }
      }
    };

    document.addEventListener("mousedown", onGlobalPointerDown, true);
    return () => {
      document.removeEventListener("mousedown", onGlobalPointerDown, true);
    };
  }, [searchOpen, queuePopupOpen, handleQueuePopupToggle]);

  const handleSearchToggle = useCallback(() => {
    toggleSearch();
  }, [toggleSearch]);

  const handlePlayFromSearch = useCallback(
    (track: any) => {
      if (!track) {
        return;
      }
      const durationMs = track.durationMs ?? track.duration_ms;
      const durationStr = durationMs
        ? `${Math.floor(durationMs / 60000)}:${Math.floor(
            (durationMs % 60000) / 1000,
          )
            .toString()
            .padStart(2, "0")}`
        : "";
      addHistoryItem({
        id: track.id,
        type: "track",
        title: track.title,
        subtitle: track.artists,
        coverUrl: track.coverUrl,
        explicit: track.explicit,
        duration: durationStr,
        durationMs,
        itemData: track,
      });
      void playerEngine.playTrack(
        track,
        [track],
        { context: { id: `radio:${track.id}`, title: track.title }, cover: track.coverUrl },
      );
    },
    [addHistoryItem],
  );

  const handleNavigateItem = useCallback(
    (it: any) => {
      closeSearch();
      if (
        it._type === "artist" ||
        it.followers !== undefined ||
        activeFilter === "artists"
      ) {
        addHistoryItem({
          id: it.id,
          type: "artist",
          title: it.name || it.title,
          subtitle: t("common.artists"),
          coverUrl: it.coverUrl,
          itemData: it,
        });
        navigate(`/artist?id=${encodeURIComponent(it.id)}`);
      } else if (
        it._type === "playlist" ||
        it.owner !== undefined ||
        activeFilter === "playlists"
      ) {
        addHistoryItem({
          id: it.id,
          type: "playlist",
          title: it.name || it.title,
          subtitle: it.author || it.owner || t("common.playlists"),
          coverUrl: it.coverUrl,
          itemData: it,
        });
        navigate(`/collection?type=playlist&id=${encodeURIComponent(it.id)}`);
      } else if (
        it._type === "album" ||
        it.totalTracks !== undefined ||
        it.total_tracks !== undefined ||
        activeFilter === "albums"
      ) {
        addHistoryItem({
          id: it.id,
          type: "album",
          title: it.name || it.title,
          subtitle: it.artists || it.artist || t("common.albums"),
          coverUrl: it.coverUrl,
          itemData: it,
        });
        navigate(`/collection?type=album&id=${encodeURIComponent(it.id)}`);
      }
    },
    [activeFilter, closeSearch, navigate, addHistoryItem, t],
  );

  const submitSearchQuery = useCallback(
    (queryToSubmit: string) => {
      const trimmed = queryToSubmit.trim();
      if (!trimmed) return;
      addHistoryItem({
        id: `query:${trimmed.toLowerCase()}`,
        type: "query",
        title: trimmed,
      });
    },
    [addHistoryItem],
  );

  const handleSelectHistoryQuery = useCallback(
    (queryText: string) => {
      setSearchQuery(queryText);
      submitSearchQuery(queryText);
      searchInputRef.current?.focus();
    },
    [submitSearchQuery],
  );

  const { resolvedTheme } = useTheme();
  const isDark =
    resolvedTheme
      ? resolvedTheme === "dark"
      : typeof document !== "undefined" &&
        (document.documentElement.getAttribute("data-theme") === "dark" ||
          (!document.documentElement.getAttribute("data-theme") &&
            window.matchMedia?.("(prefers-color-scheme: dark)")?.matches));
  const backgroundImage = useCustomizationStore((s) => s.backgroundImage);
  const backgroundBlur = useCustomizationStore((s) => s.backgroundBlur);
  const backgroundDim = useCustomizationStore((s) => s.backgroundDim);
  const contentViewConfig = useCustomizationStore((s) => s.contentView);

  const hasCustomBg = Boolean(backgroundImage && isDark);

  const mainStyle = useMemo(
    () => getBlockStyle(contentViewConfig, isDark, hasCustomBg),
    [contentViewConfig, isDark, hasCustomBg],
  );

  return (
    <div
      ref={appFrameRef}
      data-custom-bg={hasCustomBg ? "true" : undefined}
      className={`relative flex h-full w-full overflow-hidden bg-bg-canvas p-1.5 gap-1.5 ${
        isMobile ? "flex-col-reverse rounded-none" : "flex-row rounded-5xl"
      }`}
      style={isMobile ? { paddingTop: "max(6px, env(safe-area-inset-top))" } : undefined}
      onScroll={(e) => {
        if (e.currentTarget.scrollLeft !== 0) e.currentTarget.scrollLeft = 0;
        if (e.currentTarget.scrollTop !== 0) e.currentTarget.scrollTop = 0;
      }}
    >
      {hasCustomBg && backgroundImage && (
        <div
          className={`absolute inset-0 z-0 pointer-events-none overflow-hidden ${isMobile ? "" : "rounded-5xl"}`}
          aria-hidden="true"
        >
          <img
            src={backgroundImage}
            alt=""
            className="w-full h-full object-cover select-none"
            style={{
              filter: backgroundBlur > 0 ? `blur(${backgroundBlur}px)` : undefined,
              transform: backgroundBlur > 0 ? "scale(1.05)" : undefined,
            }}
          />
          {backgroundDim > 0 && (
            <div
              className="absolute inset-0 bg-black"
              style={{ opacity: backgroundDim / 100 }}
            />
          )}
        </div>
      )}

      <aside
        ref={sidebarRef}
        className={`shrink-0 z-[45] relative ${isMobile ? "w-full" : "w-[58px] h-full"}`}
      >
        <Sidebar
          searchOpen={searchOpen}
          onSearchToggle={handleSearchToggle}
          variant={isMobile ? "bar" : "rail"}
        />
      </aside>

      <div className="flex-1 flex flex-col min-w-0 h-full relative gap-1.5 overflow-hidden">
        <main
          data-custom-bg={hasCustomBg ? "true" : undefined}
          className={`flex-1 min-w-0 flex flex-col relative h-full ${
            hasCustomBg ? "" : "bg-bg-primary"
          } ${
            isMobile
              ? "rounded-xl"
              : isFullscreenPlayer
                ? "rounded-sm rounded-tr-none"
                : "rounded-sm rounded-tr-xl"
          } overflow-hidden`}
          style={mainStyle}
        >
          <div
            ref={mainScrollRef}
            className={`h-full ${
              searchOpen || isFullscreenPlayer
                ? "overflow-hidden"
                : "overflow-y-auto"
            }`}
          >

            <PageTransition>
              {isFullscreenRoute ? shellChildrenRef.current : children}
            </PageTransition>
          </div>

          <AnimatePresence>
            {searchOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0 bg-black/20 pointer-events-auto z-[30]"
                onClick={() => closeSearch()}
              />
            )}
          </AnimatePresence>

          {!isFullscreenPlayer && <OfflineBanner />}
          {!isFullscreenPlayer && <HandoffBanner />}

          {!isFullscreenPlayer && (
            <AnimatePresence initial={false}>
              {isRightDrawerOpen && (
                <motion.aside
                  key="right-drawer"
                  ref={queueDrawerRef}
                  initial={{ x: RIGHT_DRAWER_WIDTH }}
                  animate={{ x: 0 }}
                  exit={{ x: RIGHT_DRAWER_WIDTH }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="pointer-events-auto absolute inset-y-0 right-0 z-[50]"
                  style={{ width: isMobile ? "100%" : RIGHT_DRAWER_WIDTH }}
                >
                  <RightDrawer
                    activeTab={rightDrawerTab}
                    onTabChange={setRightDrawerTab}
                    onClose={closeRightPanel}
                  />
                </motion.aside>
              )}
            </AnimatePresence>
          )}
        </main>

        {shouldShowMiniPlayer && (
          <div
            ref={miniPlayerContainerRef}
            className="relative z-[40] w-full shrink-0"
          >
            <MiniPlayer
              embedded
              compact={isMobile}
              onQueueOpenChange={handleQueuePopupToggle}
              onQueueToggle={handleQueuePopupToggleRequest}
              onFullscreenOpen={openFullscreenPlayer}
            />
          </div>
        )}
      </div>

      <AnimatePresence initial={false} onExitComplete={() => fullscreenSwipe.y.set(0)}>
        {fullscreenPlayerOpen ? (
          <SlideUpOverlay
            key="fullscreen-player-overlay"
            onSettled={setFullscreenEffectsReady}
            className="dark absolute inset-0 z-[70] overflow-hidden bg-black will-change-transform"
          >
            <motion.div style={{ y: fullscreenSwipe.y }} className="h-full w-full">
              <FullscreenPlayer
                onClose={closeFullscreenPlayer}
                effectsReady={fullscreenEffectsReady}
                onSwipeStart={isMobile ? fullscreenSwipe.start : undefined}
              />
            </motion.div>
          </SlideUpOverlay>
        ) : isFullscreenRoute ? (
          <div data-theme="dark" className="dark absolute inset-0 z-[70] overflow-hidden bg-black">
            {children}
          </div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {searchOpen && (
          <motion.div
            key="search-popup-wrapper"
            ref={searchPopupRef}
            initial={{ opacity: 0, y: -12, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.99 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={`absolute right-0 z-[60] flex flex-col items-center pointer-events-none ${isMobile ? "" : "pt-[56px]"}`}
            style={{
              left: isMobile ? SHELL_EDGE_GAP : SIDEBAR_WIDTH + SHELL_EDGE_GAP,
              right: SHELL_EDGE_GAP,
              top: isMobile ? "calc(env(safe-area-inset-top) + 12px)" : 12,
            }}
          >
            {/* 1. Search Input Island */}
            <div
              className="w-full max-w-[660px] h-[54px] rounded-[8px] pointer-events-auto flex items-center px-[18px] gap-[14px] bg-bg-panel/95 border border-border-primary/50"
            >
              <span className="shrink-0 flex items-center justify-center text-text-tertiary">
                <AnimatePresence mode="wait" initial={false}>
                  {searchLoading ? (
                    <motion.span
                      key="loader"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.1 }}
                      className="inline-block h-[17px] w-[17px] rounded-full border-[1.5px] border-text-secondary border-t-transparent animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <motion.span
                      key="icon"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.1 }}
                      className="inline-flex text-text-tertiary"
                    >
                      <Search3Line size={19} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>

              <input
                ref={searchInputRef}
                type="text"
                placeholder={t("common.search")}
                autoFocus
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitSearchQuery(searchQuery);
                    runSearchNow();
                  }
                }}
                className="w-full flex-1 bg-transparent border-none outline-none text-text-primary text-[16px] placeholder:text-text-tertiary font-[400] tracking-tight"
                style={{
                  fontFamily: "var(--font-inter), sans-serif",
                  lineHeight: "1.2",
                }}
              />

              {!isMobile && <SearchSourceSwitch />}

              {/* Right: Appearing clear button */}
              <AnimatePresence>
                {searchQuery.length > 0 && (
                  <motion.button
                    key="clear-btn"
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{ duration: 0.12 }}
                    type="button"
                    aria-label="Clear search"
                    onClick={() => {
                      setSearchQuery("");
                      searchInputRef.current?.focus();
                    }}
                    className="shrink-0 text-text-tertiary hover:text-text-primary transition-colors border-none bg-transparent p-0 flex items-center justify-center cursor-pointer"
                  >
                    <CloseCircleFill size={18} />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence mode="wait">
              {hasSearchQuery ? (
                <motion.div
                  key="search-results-island"
                  initial={{ opacity: 0, y: -6, scale: 0.99 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.99 }}
                  transition={{ duration: 0.1, ease: [0.16, 1, 0.3, 1] }}
                  className={`w-full max-w-[660px] mt-[8px] ${isMobile ? "h-[min(500px,calc(100dvh-220px))]" : "h-[500px]"} rounded-[8px] pointer-events-auto flex flex-col overflow-hidden bg-bg-panel/95 border border-border-primary/50`}
                >
                  {isMobile && (
                    <div className="flex px-[14px] pt-[12px] shrink-0">
                      <SearchSourceSwitch />
                    </div>
                  )}
                  <div className="flex gap-[6px] px-[14px] pt-[12px] pb-[6px] shrink-0 overflow-x-auto">
                    {filterKeys.map((key) => {
                      const label = filterLabels[key];
                      const isActive = activeFilter === key;
                      let Icon = GridFill;
                      if (key === "tracks") Icon = Music2Fill;
                      else if (key === "artists") Icon = User2Fill;
                      else if (key === "albums") Icon = AlbumFill;
                      else if (key === "playlists") Icon = PlaylistFill;

                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setActiveFilter(key)}
                          className={`
                            relative flex items-center gap-[7px] px-[13px] py-[7px] rounded-[6px] text-[13.5px] font-normal transition-colors border-none bg-transparent cursor-pointer select-none shrink-0
                            ${
                              isActive
                                ? "text-text-primary font-medium"
                                : "text-text-secondary hover:text-text-primary hover:bg-border-alpha-14"
                            }
                          `}
                          style={{
                            fontFamily: "var(--font-inter), sans-serif",
                            lineHeight: "1.2",
                          }}
                        >
                          {isActive && (
                            <motion.div
                              layoutId="activeFilterPill"
                              className="absolute inset-0 rounded-[6px] bg-border-alpha-14 pointer-events-none z-0"
                              transition={{
                                type: "spring",
                                stiffness: 450,
                                damping: 35,
                              }}
                            />
                          )}
                          <span className="relative z-[1] flex items-center gap-[7px]">
                            <Icon size={15} />
                            <span>{label}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="relative flex-1 min-h-0 overflow-hidden">
                    <AnimatePresence mode="wait">
                      {isSearchEmpty ? (
                        <motion.div
                          key="search-empty"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.08 }}
                          className="flex h-full flex-col items-center justify-center gap-[6px] px-[20px] text-center"
                        >
                          <p
                            className="m-0 text-[14px] text-text-primary font-medium"
                            style={{
                              fontFamily: "var(--font-inter), sans-serif",
                            }}
                          >
                            {t("common.no_results")}
                          </p>
                          <p
                            className="m-0 text-[12px] text-text-tertiary"
                            style={{
                              fontFamily: "var(--font-inter), sans-serif",
                            }}
                          >
                            {t("common.try_another_search")}
                          </p>
                        </motion.div>
                      ) : searchResults.length > 0 ? (
                        <motion.div
                          key={`search-results-${activeFilter}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.08 }}
                          className="h-full w-full"
                        >
                          <SearchResultsList
                            items={searchResults}
                            isArtistSearchFilter={isArtistSearchFilter}
                            isPlaylistSearchFilter={isPlaylistSearchFilter}
                            onPlayFromSearch={handlePlayFromSearch}
                            onNavigateItem={handleNavigateItem}
                            onScroll={updateSearchMask}
                            scrollRef={searchScrollRef}
                            maskStyle={{
                              WebkitMaskImage: searchScrollMask,
                              maskImage: searchScrollMask,
                            }}
                          />
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                </motion.div>
              ) : historyItems.length > 0 ? (
                <motion.div
                  key="search-history-island"
                  initial={{ opacity: 0, y: -6, scale: 0.99 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.99 }}
                  transition={{ duration: 0.1, ease: [0.16, 1, 0.3, 1] }}
                  className="w-full max-w-[660px] mt-[8px] max-h-[min(480px,calc(100dvh-220px))] h-auto rounded-[8px] pointer-events-auto flex flex-col overflow-hidden bg-bg-panel/95 border border-border-primary/50"
                >
                  <SearchHistoryList
                    onSelectQuery={handleSelectHistoryQuery}
                    onPlayTrack={handlePlayFromSearch}
                    onNavigateItem={handleNavigateItem}
                    onScroll={updateSearchMask}
                    scrollRef={searchScrollRef}
                    maskStyle={{
                      WebkitMaskImage: searchScrollMask,
                      maskImage: searchScrollMask,
                    }}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>

      <AddToPlaylistModal />
      <AddToLibraryModal />
      <RemoveFromPlaylistModal />
      <TrackMatchModal />
      <RemoveFromLibraryModal />
      <ImportLikesModal />
      <CreatePlaylistModal />
      <ImportReviewModal />
      <SettingsModal />
      <UpdateModal />
      <UpdateToastBridge />
      <WindowControls
        isFullscreen={isFullscreenPlayer}
        style={{
          top: isFullscreenPlayer ? 12 : 18,
          right: isFullscreenPlayer ? 12 : 18,
          transition: "all 0.28s cubic-bezier(0.22, 1, 0.36, 1)",
          zIndex: 80,
        }}
      />
    </div>
  );
}
