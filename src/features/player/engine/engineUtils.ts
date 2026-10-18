/** @param prefix - marks the fallback id when crypto is unavailable */
export function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function hasErrorName(error: unknown, name: string): boolean {
  return (error as { name?: string } | null)?.name === name;
}

export function isAbortError(error: unknown): boolean {
  return hasErrorName(error, "AbortError");
}

const BYTES_PER_KB = 1024;

export function renew(controller: AbortController | null): AbortController {
  controller?.abort();
  return new AbortController();
}

export function elapsedMs(since: number): number {
  return Math.round(performance.now() - since);
}

export function kilobytes(bytes: number): number {
  return Math.round(bytes / BYTES_PER_KB);
}
