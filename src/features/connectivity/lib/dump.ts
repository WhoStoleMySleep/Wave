import type { MainNetResult } from "@/platform/native";
import { log } from "@/shared/utils/logger";
import type { DiagCheck } from "./diagnostics";
import type { FailureEntry } from "../store/connectivityStore";

export interface OfflineDump {
  generatedAt: string;
  app: {
    version: string;
    platform: string;
    userAgent: string;
    language: string;
    onLine: boolean;
  };
  endpoints: { api: string };
  summary: { ok: number; fail: number; total: number };
  checks: DiagCheck[];
  failures: FailureEntry[];
  machine: MainNetResult | null;
}

export interface DumpInput {
  checks: DiagCheck[];
  failures: FailureEntry[];
  main: MainNetResult | null;
  endpoints: { api: string };
}

export interface SaveDumpResult {
  success: boolean;
  filePath?: string;
  canceled?: boolean;
  error?: string;
}

const REVOKE_DELAY_MS = 1000;

function countByStatus(checks: DiagCheck[]): OfflineDump["summary"] {
  const counts = { ok: 0, fail: 0, total: checks.length };
  for (const check of checks) if (check.status !== "skip") counts[check.status] += 1;
  return counts;
}

/** Everything support needs and nothing it should not see: routes and timings, never tokens, headers, bodies or proxy credentials. */
export function buildOfflineDump({ checks, failures, main, endpoints }: DumpInput): OfflineDump {
  return {
    generatedAt: new Date().toISOString(),
    app: {
      version: (import.meta.env.VITE_CLIENT_VERSION as string | undefined) || "dev",
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      language: navigator.language,
      onLine: navigator.onLine,
    },
    endpoints,
    summary: countByStatus(checks),
    checks,
    failures,
    machine: main,
  };
}

export function dumpFilename(dump: OfflineDump): string {
  return `wave-offline-dump-${dump.generatedAt.replace(/[:.]/g, "-")}.json`;
}

function failed(error: unknown): SaveDumpResult {
  log("yellow", "connectivity", "saving the offline dump failed", error);
  return { success: false, error: String(error) };
}

function downloadInBrowser(filename: string, content: string): SaveDumpResult {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
  return { success: true };
}

/** The desktop app saves through the native dialog, which tells where the file went; the web falls back to a download. */
export async function downloadDump(dump: OfflineDump): Promise<SaveDumpResult> {
  const content = JSON.stringify(dump, null, 2);
  const filename = dumpFilename(dump);
  try {
    const saveDump = window.waveNative?.saveDump;
    if (!saveDump) return downloadInBrowser(filename, content);
    const { success, filePath, canceled, error } = await saveDump({ filename, content });
    return { success, filePath, canceled, error };
  } catch (error) {
    return failed(error);
  }
}
