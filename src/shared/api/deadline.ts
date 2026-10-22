import { ApiError } from "./apiError";
import { noticeConnectionFailure } from "./apiNotices";

export const DEFAULT_TIMEOUT_MS = 15_000;

function followSignal(controller: AbortController, signal: AbortSignal | null | undefined): () => void {
  if (!signal) return () => {};
  if (signal.aborted) {
    controller.abort(signal.reason);
    return () => {};
  }
  const forward = () => controller.abort(signal.reason);
  signal.addEventListener("abort", forward, { once: true });
  return () => signal.removeEventListener("abort", forward);
}

function connectionError(error: unknown, callerSignal: AbortSignal | null | undefined, timedOut: boolean, quiet: boolean): unknown {
  if (callerSignal?.aborted) return error;
  if (!quiet) noticeConnectionFailure(timedOut ? "timeout" : "network");
  return timedOut
    ? new ApiError(0, "Request timed out", "TIMEOUT_ERROR")
    : new ApiError(0, "Unable to reach the server", "NETWORK_ERROR");
}

/**
 * fetch that gives up after `timeoutMs`, so a stalled connection cannot hang the UI.
 * @param quiet - the caller copes with the failure itself, so no toast tells the user about it
 * @throws ApiError with status 0 when the server is unreachable or too slow
 */
export async function fetchWithin(url: string, init: RequestInit, timeoutMs: number, { quiet = false } = {}): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const unfollow = followSignal(controller, init.signal);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    throw connectionError(error, init.signal, timedOut, quiet);
  } finally {
    clearTimeout(timer);
    unfollow();
  }
}
