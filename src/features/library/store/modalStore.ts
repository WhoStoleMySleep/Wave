import { create } from "zustand";

export interface LibraryItemDetail {
  id: string;
  title: string;
  coverUrl: string;
  type: "album" | "artist" | "playlist";
  subtitle?: string;
  totalTracks?: number;
}

export interface PlaylistOption {
  id: string;
  title: string;
  description?: string;
  coverUrl: string;
  trackCount: number;
}

export interface TrackDetail {
  id: string;
  title: string;
  artists: string;
  coverUrl: string;
  duration?: string;
  durationMs?: number;
  playlists?: PlaylistOption[];
}

export interface RemoveLibraryDetail {
  id: string;
  title: string;
  coverUrl: string;
  type: "album" | "artist" | "playlist";
  subtitle?: string;
  isOwned?: boolean;
}

export interface RemovePlaylistDetail {
  trackId: string;
  playlistItemId?: string;
  trackTitle: string;
  trackArtists: string;
  trackCoverUrl: string;
  playlistId?: string;
  playlistTitle?: string;
}

interface ModalState {
  addToLibraryOpen: boolean;
  addToLibraryItem: LibraryItemDetail | null;
  openAddToLibrary: (item: LibraryItemDetail) => void;
  closeAddToLibrary: () => void;

  addToPlaylistOpen: boolean;
  addToPlaylistTrack: TrackDetail | null;
  addToPlaylistMode: "add" | "manage";
  /**
   * "add" puts the track into one picked playlist; "manage" lists where it is
   * saved (likes included) and toggles each, the player's second tap on a saved track.
   */
  openAddToPlaylist: (track: TrackDetail, mode?: "add" | "manage") => void;
  closeAddToPlaylist: () => void;

  createPlaylistOpen: boolean;
  createPlaylistInitialUrl: string;
  createPlaylistPendingTrack: TrackDetail | null;
  openCreatePlaylist: (initialUrl?: string, pendingTrack?: TrackDetail | null) => void;
  closeCreatePlaylist: () => void;

  removeFromLibraryOpen: boolean;
  removeFromLibraryDetail: RemoveLibraryDetail | null;
  openRemoveFromLibrary: (detail: RemoveLibraryDetail) => void;
  closeRemoveFromLibrary: () => void;

  removeFromPlaylistOpen: boolean;
  removeFromPlaylistDetail: RemovePlaylistDetail | null;
  openRemoveFromPlaylist: (detail: RemovePlaylistDetail) => void;
  closeRemoveFromPlaylist: () => void;

  importLikesOpen: boolean;
  importLikesInitialUsername: string;
  openImportLikes: (initialUsername?: string) => void;
  closeImportLikes: () => void;

  importReviewOpen: boolean;
  importReviewJobId: string | null;
  openImportReview: (jobId: string) => void;
  closeImportReview: () => void;

  searchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  toggleSearch: () => void;

  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  toggleSettings: () => void;
}

export const useModalStore = create<ModalState>((set) => ({
  addToLibraryOpen: false,
  addToLibraryItem: null,
  openAddToLibrary: (item) =>
    set({ addToLibraryOpen: true, addToLibraryItem: item }),
  closeAddToLibrary: () =>
    set({ addToLibraryOpen: false, addToLibraryItem: null }),

  addToPlaylistOpen: false,
  addToPlaylistTrack: null,
  addToPlaylistMode: "add",
  openAddToPlaylist: (track, mode = "add") =>
    set({ addToPlaylistOpen: true, addToPlaylistTrack: track, addToPlaylistMode: mode }),
  closeAddToPlaylist: () =>
    set({ addToPlaylistOpen: false, addToPlaylistTrack: null }),

  createPlaylistOpen: false,
  createPlaylistInitialUrl: "",
  createPlaylistPendingTrack: null,
  openCreatePlaylist: (initialUrl = "", pendingTrack = null) =>
    set({
      createPlaylistOpen: true,
      createPlaylistInitialUrl: initialUrl,
      createPlaylistPendingTrack: pendingTrack,
    }),
  closeCreatePlaylist: () =>
    set({
      createPlaylistOpen: false,
      createPlaylistInitialUrl: "",
      createPlaylistPendingTrack: null,
    }),

  removeFromLibraryOpen: false,
  removeFromLibraryDetail: null,
  openRemoveFromLibrary: (detail) =>
    set({ removeFromLibraryOpen: true, removeFromLibraryDetail: detail }),
  closeRemoveFromLibrary: () =>
    set({ removeFromLibraryOpen: false, removeFromLibraryDetail: null }),

  removeFromPlaylistOpen: false,
  removeFromPlaylistDetail: null,
  openRemoveFromPlaylist: (detail) =>
    set({ removeFromPlaylistOpen: true, removeFromPlaylistDetail: detail }),
  closeRemoveFromPlaylist: () =>
    set({ removeFromPlaylistOpen: false, removeFromPlaylistDetail: null }),

  importLikesOpen: false,
  importLikesInitialUsername: "",
  openImportLikes: (initialUsername = "") =>
    set({ importLikesOpen: true, importLikesInitialUsername: initialUsername }),
  closeImportLikes: () =>
    set({ importLikesOpen: false, importLikesInitialUsername: "" }),

  importReviewOpen: false,
  importReviewJobId: null,
  openImportReview: (jobId) => set({ importReviewOpen: true, importReviewJobId: jobId }),
  closeImportReview: () => set({ importReviewOpen: false }),

  searchOpen: false,
  openSearch: () => set({ searchOpen: true }),
  closeSearch: () => set({ searchOpen: false }),
  toggleSearch: () => set((state) => ({ searchOpen: !state.searchOpen })),

  settingsOpen: false,
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  toggleSettings: () => set((state) => ({ settingsOpen: !state.settingsOpen })),
}));
