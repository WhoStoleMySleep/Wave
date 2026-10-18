import { useMemo } from "react";
import { create } from "zustand";
import { api, mediaUrl } from "@/shared/api";
import { audioCache, isCompleteAudioResponse, waveDb, type DownloadRecord } from "@/shared/storage";
import { showToast } from "@/shared/ui";
import { createTranslatorSync, getStoredLocale } from "@/languages";
import { log } from "@/shared/utils/logger";
import type { Track } from "@/shared/types";

export type DownloadStatus = "queued" | "downloading" | "error";

const CONCURRENCY = 2;
const AUTO_COLLECTIONS_KEY = "wave_auto_download_collections";

interface DownloadState {
  hydrated: boolean;
  /** Completed downloads keyed by track id. */
  records: Record<string, DownloadRecord>;
  /** In-flight or failed downloads; completed ones live in `records`. */
  statuses: Record<string, DownloadStatus>;
  /** Fraction 0..1 for tracks that are currently downloading. */
  progress: Record<string, number>;
  /** Collections whose tracks are kept downloaded, including ones added later. */
  autoCollections: string[];
  hydrate: () => Promise<void>;
  download: (tracks: Track[]) => void;
  remove: (trackIds: string[]) => Promise<void>;
  cancel: (trackIds: string[]) => void;
  cancelAll: () => void;
  followCollection: (collectionId: string, tracks: Track[]) => void;
  unfollowCollection: (collectionId: string, tracks: Track[]) => void;
  syncCollection: (collectionId: string, tracks: Track[]) => Promise<void>;
}

const queue: Track[] = [];
const controllers = new Map<string, AbortController>();
let batchFailures = 0;
let hydratePromise: Promise<void> | null = null;

async function fetchAudio(
  track: Track,
  signal: AbortSignal,
  onProgress: (fraction: number) => void,
): Promise<{ blob: Blob; mimeType: string; loudnessDb?: number | null }> {
  const session = await api.createPlaybackSession(track.id, signal);
  const response = await fetch(mediaUrl(session.streamUrl), {
    headers: { Range: "bytes=0-" },
    signal,
  });
  if (!isCompleteAudioResponse(response)) {
    throw new Error(`stream responded ${response.status} ${response.headers.get("content-range") ?? ""}`.trim());
  }

  const mimeType =
    session.mimeType || response.headers.get("content-type") || "audio/webm";
  const total = Number(response.headers.get("content-length")) || 0;
  const reader = response.body?.getReader();
  if (!reader) {
    return {
      blob: new Blob([await response.arrayBuffer()], { type: mimeType }),
      mimeType,
      loudnessDb: session.loudnessDb,
    };
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    if (total > 0) onProgress(Math.min(1, received / total));
  }
  // a connection that closes early ends the stream without an error
  if (total > 0 && received < total) throw new Error(`stream ended at ${received} of ${total} bytes`);
  return { blob: new Blob(chunks as BlobPart[], { type: mimeType }), mimeType, loudnessDb: session.loudnessDb };
}

function readAutoCollections(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(AUTO_COLLECTIONS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch (error) {
    log("yellow", "downloads", "auto-download list is unreadable", error);
    return [];
  }
}

function writeAutoCollections(ids: string[]): void {
  try {
    localStorage.setItem(AUTO_COLLECTIONS_KEY, JSON.stringify(ids));
  } catch (error) {
    log("red", "downloads", "auto-download list could not be saved", error);
  }
}

function omit<T>(map: Record<string, T>, key: string): Record<string, T> {
  if (!(key in map)) return map;
  const next = { ...map };
  delete next[key];
  return next;
}

export const useDownloadStore = create<DownloadState>((set, get) => {
  const pump = () => {
    while (controllers.size < CONCURRENCY && queue.length > 0) {
      const track = queue.shift()!;
      if (get().statuses[track.id] !== "queued") continue;
      void runDownload(track);
    }

    if (controllers.size === 0 && queue.length === 0 && batchFailures > 0) {
      const t = createTranslatorSync(getStoredLocale());
      showToast(t("downloads.failed", { count: batchFailures }), "error");
      batchFailures = 0;
    }
  };

  const runDownload = async (track: Track) => {
    const controller = new AbortController();
    controllers.set(track.id, controller);
    set((s) => ({
      statuses: { ...s.statuses, [track.id]: "downloading" },
      progress: { ...s.progress, [track.id]: 0 },
    }));

    try {
      // audio already cached by playback is complete, so pinning is enough
      if (!(await waveDb.hasAudio(track.id))) {
        const { blob, mimeType, loudnessDb } = await fetchAudio(track, controller.signal, (fraction) => {
          set((s) => ({ progress: { ...s.progress, [track.id]: fraction } }));
        });
        if (controller.signal.aborted) return;
        await waveDb.putAudio(track.id, blob, { mimeType, loudnessDb });
      }
      if (controller.signal.aborted) return;

      await waveDb.putTrack(track);
      const record = await waveDb.putDownload(track);
      // remove() may have run while the record was being written
      if (controller.signal.aborted) {
        await waveDb.deleteDownload(track.id);
        await audioCache.deleteAudio(track.id);
        return;
      }
      set((s) => ({
        records: { ...s.records, [track.id]: record },
        statuses: omit(s.statuses, track.id),
      }));
      // lazy import breaks the player -> downloads -> player module cycle
      void import("@/features/player/engine/playerEngine")
        .then(({ playerEngine }) => playerEngine?.prefetchLyrics(track.id))
        .catch(() => {});
      log("green", "downloads", `downloaded: ${track.title}`);
    } catch (err) {
      if (controller.signal.aborted) return;
      batchFailures += 1;
      set((s) => ({ statuses: { ...s.statuses, [track.id]: "error" } }));
      log("red", "downloads", `failed: ${track.title} (${String(err)})`);
    } finally {
      controllers.delete(track.id);
      set((s) => ({ progress: omit(s.progress, track.id) }));
      pump();
    }
  };

  const setAutoCollections = (ids: string[]) => {
    writeAutoCollections(ids);
    set({ autoCollections: ids });
  };

  return {
    hydrated: false,
    records: {},
    statuses: {},
    progress: {},
    autoCollections: typeof localStorage === "undefined" ? [] : readAutoCollections(),

    hydrate: () => {
      hydratePromise ??= waveDb.getDownloads().then((list) => {
        const records: Record<string, DownloadRecord> = {};
        for (const record of list) records[record.trackId] = record;
        set((s) => ({ hydrated: true, records: { ...records, ...s.records } }));
      });
      return hydratePromise;
    },

    download: (tracks) => {
      const { records, statuses } = get();
      const fresh = tracks.filter(
        (track) =>
          track.id &&
          !records[track.id] &&
          statuses[track.id] !== "queued" &&
          statuses[track.id] !== "downloading",
      );
      if (fresh.length === 0) return;

      queue.push(...fresh);
      set((s) => {
        const next = { ...s.statuses };
        for (const track of fresh) next[track.id] = "queued";
        return { statuses: next };
      });
      pump();
    },

    remove: async (trackIds) => {
      for (const id of trackIds) controllers.get(id)?.abort();
      set((s) => {
        const records = { ...s.records };
        const statuses = { ...s.statuses };
        for (const id of trackIds) {
          delete records[id];
          delete statuses[id];
        }
        return { records, statuses };
      });
      for (const id of trackIds) {
        await waveDb.deleteDownload(id);
        await audioCache.deleteAudio(id);
      }
    },

    /** Stops queued and running downloads of these tracks; finished ones stay downloaded. */
    cancel: (trackIds) => {
      const ids = new Set(trackIds);
      for (let i = queue.length - 1; i >= 0; i--) if (ids.has(queue[i].id)) queue.splice(i, 1);
      for (const id of ids) controllers.get(id)?.abort();
      set((s) => {
        const statuses = { ...s.statuses };
        const progress = { ...s.progress };
        for (const id of ids) {
          if (statuses[id] !== "error") delete statuses[id];
          delete progress[id];
        }
        return { statuses, progress };
      });
    },

    cancelAll: () => {
      queue.length = 0;
      for (const controller of controllers.values()) controller.abort();
      set((s) => {
        const statuses: Record<string, DownloadStatus> = {};
        for (const [id, status] of Object.entries(s.statuses)) {
          if (status === "error") statuses[id] = status;
        }
        return { statuses, progress: {} };
      });
    },

    followCollection: (collectionId, tracks) => {
      const { autoCollections, download } = get();
      if (!autoCollections.includes(collectionId)) setAutoCollections([...autoCollections, collectionId]);
      download(tracks);
    },

    unfollowCollection: (collectionId, tracks) => {
      setAutoCollections(get().autoCollections.filter((id) => id !== collectionId));
      get().cancel(tracks.map((track) => track.id));
    },

    /**
     * Downloads what a followed collection gained since its last sync. Waits for the saved
     * downloads first, otherwise every finished track would look missing and be queued again.
     * Failed tracks are left for an explicit retry, so each library change does not repeat the failure.
     */
    syncCollection: async (collectionId, tracks) => {
      if (!get().autoCollections.includes(collectionId)) return;
      await get().hydrate();
      const { autoCollections, statuses, download } = get();
      if (!autoCollections.includes(collectionId)) return;
      download(tracks.filter((track) => statuses[track.id] !== "error"));
    },
  };
});

/** Download state of a single track, `"done"` once it is stored offline. */
export function useTrackDownloadState(trackId: string | undefined): {
  status: DownloadStatus | "done" | null;
  progress: number;
} {
  const status = useDownloadStore((s) => {
    if (!trackId) return null;
    if (s.records[trackId]) return "done" as const;
    return s.statuses[trackId] ?? null;
  });
  const progress = useDownloadStore((s) => (trackId ? (s.progress[trackId] ?? 0) : 0));
  return { status, progress };
}

/** Downloaded tracks, most recent first. */
export function useDownloadedTracks(): Track[] {
  const records = useDownloadStore((s) => s.records);
  return useMemo(
    () =>
      Object.values(records)
        .sort((a, b) => b.downloadedAt - a.downloadedAt)
        .map((record) => record.track),
    [records],
  );
}
