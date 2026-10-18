import { create } from "zustand";
import { api, getApiBaseUrl, type CatalogTrack, type ImportJob, type ImportJobStatus, type ImportReview } from "@/shared/api";
import { showToast } from "@/shared/ui";
import { createTranslatorSync, getStoredLocale } from "@/languages";
import { log } from "@/shared/utils/logger";
import { notifyLibraryChanged } from "../hooks/usePlaylists";
import { failedJob, latestList, mergeJobMessage, parseImportMessage, type ImportJobMessage } from "../lib/importMessages";
import { useModalStore, type TrackDetail } from "./modalStore";

export interface ImportState {
  job: ImportJob | null;
  isPolling: boolean;
  error: string | null;
  pendingTrack: TrackDetail | null;
  reviewItems: ImportReview[] | null;
  approvedTracks: CatalogTrack[] | null;
  startImport: (url: string, pendingTrack?: TrackDetail | null) => Promise<ImportJob>;
  pollJob: (jobId: string) => Promise<void>;
  finishReview: (jobId: string, finalized: boolean) => Promise<boolean>;
  cancelPolling: () => void;
  reset: () => void;
}

export interface ReviewFinish {
  tracks: CatalogTrack[];
  title?: string;
  description?: string;
}

const POLL_INTERVAL_MS = 1000;
const POLL_RETRY_MS = 2500;
const PLAYLIST_SYNC_ATTEMPTS = 20;
const PLAYLIST_SYNC_INTERVAL_MS = 800;

const IDLE = {
  job: null,
  isPolling: false,
  error: null,
  pendingTrack: null,
  reviewItems: null,
  approvedTracks: null,
};

let socket: WebSocket | null = null;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

function closeConnections() {
  if (socket) {
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    socket.close();
    socket = null;
  }
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJob(jobId: string): Promise<ImportJob | Error> {
  try {
    return await api.getPlaylistImport(jobId);
  } catch (error) {
    log("yellow", "import", `fetching import ${jobId} failed`, error);
    return error instanceof Error ? error : new Error(String(error));
  }
}

function isCurrentJob(jobId: string): boolean {
  return useImportStore.getState().job?.id === jobId;
}

function complete(job: ImportJob) {
  useImportStore.setState({ isPolling: false, job });
  notifyLibraryChanged();
}

/** The playlist is created after the job completes, so the id is fetched until it appears or the job is dismissed. */
async function completeWithPlaylist(job: ImportJob) {
  for (let attempt = 0; attempt < PLAYLIST_SYNC_ATTEMPTS; attempt++) {
    if (!isCurrentJob(job.id)) return;
    const synced = await fetchJob(job.id);
    if (!(synced instanceof Error) && synced.playlistId) return complete(synced);
    await delay(PLAYLIST_SYNC_INTERVAL_MS);
  }
  if (isCurrentJob(job.id)) complete(job);
}

const SETTLE: Partial<Record<ImportJobStatus, (job: ImportJob) => void>> = {
  awaiting_decision: (job) => {
    useImportStore.setState({ isPolling: false });
    useModalStore.getState().openImportReview(job.id);
  },
  completed: (job) => (job.playlistId ? complete(job) : void completeWithPlaylist(job)),
  failed: (job) => useImportStore.setState({ isPolling: false, error: job.error?.message || "Import failed" }),
};

function applyJobMessage(started: ImportJob, message: ImportJobMessage): ImportJob {
  const state = useImportStore.getState();
  const job = mergeJobMessage(started, message);
  useImportStore.setState({
    job,
    reviewItems: latestList(message.reviewItems, state.reviewItems),
    approvedTracks: latestList(message.approvedTracks, state.approvedTracks),
  });
  return job;
}

function dropConnection(code: string, message: string) {
  closeConnections();
  useImportStore.setState((state) => ({ isPolling: false, error: message, job: failedJob(state.job, code, message) }));
}

function socketUrl(token: string): URL {
  const url = new URL(`${getApiBaseUrl().replace(/^http/, "ws")}/v1/imports/ws`);
  url.searchParams.set("token", token);
  return url;
}

function openSocket(token: string): WebSocket | null {
  try {
    return new WebSocket(socketUrl(token));
  } catch (error) {
    log("yellow", "import", "import socket did not open", error);
    useImportStore.setState({ error: "Failed to connect to import service", isPolling: false });
    return null;
  }
}

/** Detaching the handlers before closing keeps a settled job from being reported as disconnected. */
function listen(started: ImportJob, token: string) {
  closeConnections();
  const ws = openSocket(token);
  if (!ws) return;
  socket = ws;
  ws.onmessage = (event) => {
    const message = parseImportMessage(String(event.data));
    if (!message) return;
    const job = applyJobMessage(started, message);
    const settle = SETTLE[job.status];
    if (!settle) return;
    closeConnections();
    settle(job);
  };
  ws.onerror = () => dropConnection("CONNECTION_ERROR", "Import service connection error");
  ws.onclose = () => dropConnection("DISCONNECTED", "Import service disconnected");
}

function schedulePoll(jobId: string, ms: number) {
  pollTimer = setTimeout(() => void useImportStore.getState().pollJob(jobId), ms);
}

export const useImportStore = create<ImportState>((set, get) => ({
  ...IDLE,

  reset: () => {
    closeConnections();
    set(IDLE);
  },

  cancelPolling: () => {
    closeConnections();
    set({ isPolling: false });
  },

  startImport: async (url, pendingTrack = null) => {
    closeConnections();
    set({ error: null, isPolling: true, pendingTrack, reviewItems: null, approvedTracks: null });
    let job: ImportJob;
    try {
      job = await api.createPlaylistImport(url);
    } catch (error) {
      set({ error: "Failed to start import", isPolling: false, pendingTrack: null });
      throw error;
    }
    set({ job });
    if (job.status === "completed") SETTLE.completed?.(job);
    else if (job.importToken) listen(job, job.importToken);
    else set({ error: "Import worker unavailable", isPolling: false, pendingTrack: null, job: null });
    return job;
  },

  pollJob: async (jobId) => {
    if (pollTimer) clearTimeout(pollTimer);
    const job = await fetchJob(jobId);
    if (!get().isPolling) return;
    if (job instanceof Error) return schedulePoll(jobId, POLL_RETRY_MS);
    set({ job });
    if (job.status === "awaiting_decision") return set({ isPolling: false });
    const settle = SETTLE[job.status];
    if (settle) return settle(job);
    schedulePoll(jobId, POLL_INTERVAL_MS);
  },

  /** @returns true once the import is done; otherwise polling resumes until it is */
  finishReview: async (jobId, finalized) => {
    const fetched = await fetchJob(jobId);
    const job = fetched instanceof Error ? null : fetched;
    if (finalized || job?.status === "completed") {
      set({ job, isPolling: false, reviewItems: null, approvedTracks: null });
      notifyLibraryChanged();
      return true;
    }
    set({ job, isPolling: true });
    void get().pollJob(jobId);
    return false;
  },
}));

/** @returns the socket's review items for this job, or null when they have not arrived */
export function reviewItemsFor(jobId: string): ImportReview[] | null {
  const { job, reviewItems } = useImportStore.getState();
  return job?.id === jobId && reviewItems?.length ? reviewItems : null;
}

/** The server builds the playlist only from the tracks sent with the decision, so auto-matched ones go along. */
export function reviewFinish(jobId: string, chosen: CatalogTrack[] = []): ReviewFinish {
  const { job, approvedTracks } = useImportStore.getState();
  const matched = job?.id === jobId ? (approvedTracks ?? []) : [];
  return { tracks: [...matched, ...chosen], title: job?.title, description: job?.description };
}

async function addPendingTrack(playlistId: string, track: TrackDetail) {
  const translate = createTranslatorSync(getStoredLocale());
  try {
    await api.addPlaylistTrack(playlistId, track.id);
    notifyLibraryChanged();
    showToast(translate("common.added_to_playlist"), "checkmark", { description: track.title || undefined });
  } catch (error) {
    log("yellow", "import", "adding the pending track failed", error);
    showToast(translate("common.failed_add_playlist"), "error");
  }
}

useImportStore.subscribe(({ job, pendingTrack }) => {
  if (job?.status !== "completed" || !job.playlistId || !pendingTrack) return;
  useImportStore.setState({ pendingTrack: null });
  void addPendingTrack(job.playlistId, pendingTrack);
});
