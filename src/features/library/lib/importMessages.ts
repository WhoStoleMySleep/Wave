import type { CatalogTrack, ImportJob, ImportReview } from "@/shared/api";
import { log } from "@/shared/utils/logger";

export interface ImportJobMessage extends Partial<ImportJob> {
  type: "job";
  status: ImportJob["status"];
  reviewItems?: ImportReview[];
  approvedTracks?: CatalogTrack[];
}

function isJobMessage(value: unknown): value is ImportJobMessage {
  return typeof value === "object" && value !== null && (value as { type?: unknown }).type === "job";
}

/** @returns the job update, or null for any other socket message */
export function parseImportMessage(data: string): ImportJobMessage | null {
  try {
    const message: unknown = JSON.parse(data);
    return isJobMessage(message) ? message : null;
  } catch (error) {
    log("yellow", "import", "unreadable import socket message", error);
    return null;
  }
}

/** The socket sends only what changed, so empty identity fields keep the known values. */
export function mergeJobMessage(job: ImportJob, message: ImportJobMessage): ImportJob {
  return {
    id: message.id || job.id,
    source: message.source || job.source,
    sourceUrl: message.sourceUrl || job.sourceUrl,
    title: message.title || job.title,
    description: message.description || job.description,
    status: message.status,
    requiresDecision: Boolean(message.requiresDecision),
    playlistId: message.playlistId,
    result: message.result ?? job.result,
    error: message.error,
    createdAt: message.createdAt || job.createdAt,
  };
}

export function latestList<T>(next: T[] | undefined, current: T[] | null): T[] | null {
  return next && next.length > 0 ? next : current;
}

export function failedJob(job: ImportJob | null, code: string, message: string): ImportJob | null {
  return job ? { ...job, status: "failed", error: { code, message } } : null;
}
