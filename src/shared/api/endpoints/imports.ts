import type { ImportJob, ImportReview, ImportReviewDecision } from "../../contracts";
import { apiPath } from "../apiPath";
import { request } from "../client";

export interface ImportFinish {
  tracks?: unknown[];
  title?: string;
  description?: string;
}

export interface ReviewOutcome {
  approved: string[];
  denied: string[];
  finalized?: boolean;
}

function reviewPath(importId: string): string {
  return apiPath`/v1/me/playlist-imports/${importId}/review`;
}

export const importEndpoints = {
  createPlaylistImport(url: string): Promise<ImportJob> {
    return request<ImportJob>("/v1/me/playlist-imports", { method: "POST", body: { url } });
  },

  getPlaylistImport(importId: string): Promise<ImportJob> {
    return request<ImportJob>(apiPath`/v1/me/playlist-imports/${importId}`);
  },

  getPlaylistImportReview(importId: string): Promise<{ items: ImportReview[] }> {
    return request<{ items: ImportReview[] }>(reviewPath(importId));
  },

  decidePlaylistImportReview(importId: string, decisions: ImportReviewDecision[], finish: ImportFinish = {}): Promise<ReviewOutcome> {
    return request<ReviewOutcome>(reviewPath(importId), { method: "POST", body: { decisions, ...finish } });
  },

  /** Denies every track still waiting for review. */
  skipPlaylistImportReview(importId: string, finish: ImportFinish = {}): Promise<{ denied: "all"; finalized: boolean }> {
    const body = {
      action: "skip",
      tracks: finish.tracks?.length ? finish.tracks : undefined,
      title: finish.title || undefined,
      description: finish.description || undefined,
    };
    return request<{ denied: "all"; finalized: boolean }>(reviewPath(importId), { method: "POST", body });
  },
};
