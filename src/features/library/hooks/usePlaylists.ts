import { useEffect, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import { api, type UserPlaylist } from "@/shared/api";
import { queryCache } from "@/shared/cache/queryCache";
import { onConnectivityRestored } from "@/features/connectivity/store/connectivityStore";
import { log } from "@/shared/utils/logger";
import {
  readCoverCache,
  rememberCovers,
  toCoverEntry,
  toDetail,
  writeCoverCache,
  type CoverEntry,
  type LibraryPlaylistDetail,
} from "../lib/playlistDetail";
import { LibraryResource } from "./libraryResource";
import { deleteLibrarySnapshot, readLibrarySnapshot, writeLibrarySnapshot } from "./librarySnapshot";

export type { LibraryPlaylistDetail } from "../lib/playlistDetail";

export interface LibraryPlaylistSummary {
  id: string;
  title: string;
  description?: string;
  trackCount: number;
  coverUrl: string;
  coverUrls: string[];
  updatedAt: string;
  createdAt: string;
  revision: number;
}

interface PlaylistList {
  playlists: LibraryPlaylistSummary[];
  total: number;
}

interface DetailState {
  data: LibraryPlaylistDetail | null;
  error: unknown;
  isLoading: boolean;
}

const EMPTY: PlaylistList = { playlists: [], total: 0 };

function detailCacheKey(id: string): string {
  return `playlist:detail:${id}`;
}

function detailSnapshotKey(id: string): string {
  return `library:playlist:${id}`;
}

function withCovers(playlist: UserPlaylist, entry: CoverEntry): LibraryPlaylistSummary {
  return { ...playlist, trackCount: entry.trackCount, coverUrl: entry.coverUrls[0] ?? "", coverUrls: entry.coverUrls };
}

async function fetchCoverEntry(playlist: UserPlaylist): Promise<CoverEntry> {
  const detail = toDetail(await api.getUserPlaylist(playlist.id));
  writeLibrarySnapshot(detailSnapshotKey(playlist.id), detail);
  return toCoverEntry(detail, playlist.updatedAt);
}

/**
 * Saves the contents of playlists while online, so ones never opened on this device still open
 * offline. One at a time to keep the background load light; stops at the first failure, the next
 * list load picks up the rest.
 */
async function saveMissingDetails(playlists: LibraryPlaylistSummary[]): Promise<void> {
  for (const playlist of playlists) {
    const saved = await readLibrarySnapshot<LibraryPlaylistDetail>(detailSnapshotKey(playlist.id));
    if (saved?.revision === playlist.revision) continue;
    try {
      writeLibrarySnapshot(detailSnapshotKey(playlist.id), toDetail(await api.getUserPlaylist(playlist.id)));
    } catch (error) {
      log("yellow", "library", `saving playlist ${playlist.id} for offline failed`, error);
      return;
    }
  }
}

/** Only playlists changed since their covers were saved are opened to read new covers. */
async function fetchPlaylists(): Promise<PlaylistList> {
  const saved = readCoverCache();
  const { items } = await api.listPlaylists();
  const changed = items.filter((playlist) => saved[playlist.id]?.updatedAt !== playlist.updatedAt);
  const entries = await Promise.all(changed.map(fetchCoverEntry));
  const fresh = new Map(changed.map((playlist, index) => [playlist.id, entries[index]]));
  const covers = Object.fromEntries(items.map((playlist) => [playlist.id, fresh.get(playlist.id) ?? saved[playlist.id]]));
  writeCoverCache(covers);
  const playlists = items.map((playlist) => withCovers(playlist, covers[playlist.id]));
  void saveMissingDetails(playlists.filter((playlist) => !fresh.has(playlist.id)));
  return { playlists, total: playlists.length };
}

const playlists = new LibraryResource<PlaylistList>({
  snapshotKey: "library:playlists",
  empty: EMPTY,
  fetch: fetchPlaylists,
  isEmpty: (data) => data.playlists.length === 0,
});
playlists.watch();

export function notifyLibraryChanged() {
  window.dispatchEvent(new Event("library:changed"));
}

/** Drops the playlist from every cache at once, so the UI updates before the server answers. */
export function evictPlaylistFromCache(id: string) {
  playlists.update((data) => ({
    playlists: data.playlists.filter((playlist) => playlist.id !== id),
    total: Math.max(0, data.total - 1),
  }));
  queryCache.delete(detailCacheKey(id));
  deleteLibrarySnapshot(detailSnapshotKey(id));
}

export function usePlaylistsList() {
  const state = useSyncExternalStore(playlists.subscribe, playlists.getView, () => playlists.serverView);
  useEffect(() => {
    void playlists.load();
  }, []);
  return state;
}

async function fetchDetail(id: string): Promise<LibraryPlaylistDetail> {
  const response = await api.getUserPlaylist(id);
  const detail = toDetail(response);
  rememberCovers(id, toCoverEntry(detail, response.playlist.updatedAt));
  queryCache.set(detailCacheKey(id), detail);
  writeLibrarySnapshot(detailSnapshotKey(id), detail);
  return detail;
}

function cachedDetail(id: string | null): DetailState {
  const cached = id ? queryCache.get<LibraryPlaylistDetail>(detailCacheKey(id)) : undefined;
  return { data: cached ?? null, error: undefined, isLoading: Boolean(id) && !cached };
}

interface DetailRun {
  active: boolean;
  fetched: boolean;
  show: (patch: Partial<DetailState>) => void;
}

async function restoreDetail(id: string, run: DetailRun): Promise<void> {
  if (queryCache.get(detailCacheKey(id))) return;
  const detail = await readLibrarySnapshot<LibraryPlaylistDetail>(detailSnapshotKey(id));
  if (!detail || !run.active || run.fetched) return;
  queryCache.set(detailCacheKey(id), detail);
  run.show({ data: detail, isLoading: false });
}

/** Offline the request can fail before the saved copy is read, so a failure waits for that copy instead of showing "not found". */
async function refreshDetail(id: string, run: DetailRun, restored: Promise<void>): Promise<void> {
  try {
    const data = await fetchDetail(id);
    run.fetched = true;
    run.show({ data, error: undefined, isLoading: false });
  } catch (error) {
    log("yellow", "library", `playlist ${id} failed to load`, error);
    await restored;
    run.show({ error, isLoading: false });
  }
}

function watchDetail(id: string, setState: Dispatch<SetStateAction<DetailState>>): () => void {
  const run: DetailRun = {
    active: true,
    fetched: false,
    show: (patch) => run.active && setState((state) => ({ ...state, ...patch })),
  };
  const restored = restoreDetail(id, run);
  const refresh = () => void refreshDetail(id, run, restored);
  refresh();
  window.addEventListener("library:changed", refresh);
  const stopWatchingConnectivity = onConnectivityRestored(refresh);
  return () => {
    run.active = false;
    window.removeEventListener("library:changed", refresh);
    stopWatchingConnectivity();
  };
}

export function usePlaylist(id: string | null) {
  const [state, setState] = useState(() => cachedDetail(id));
  useEffect(() => {
    setState(cachedDetail(id));
    if (id) return watchDetail(id, setState);
  }, [id]);
  return state;
}
