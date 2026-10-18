import type { CatalogTrack } from "./catalog";

export type ImportJobStatus = "queued" | "running" | "awaiting_decision" | "finalizing" | "completed" | "failed";

export interface ImportJob {
  id: string;
  source: string;
  sourceUrl: string;
  title: string;
  description?: string;
  status: ImportJobStatus;
  requiresDecision: boolean;
  playlistId?: string;
  result: { total: number; imported: number; skipped: number };
  error?: { code: string; message: string };
  importToken?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface SourceTrack {
  sourceId: string;
  title: string;
  artists: string[];
  album?: string;
  durationMs?: number;
  coverUrl?: string;
}

export interface ImportReview {
  id: string;
  sourceTrack: SourceTrack;
  proposedTrack?: CatalogTrack;
  score?: number;
  reason: string;
  status: "pending" | "approved" | "denied";
  position: number;
  createdAt: string;
}

export interface ImportReviewDecision {
  reviewId: string;
  decision: "approve" | "deny";
}
