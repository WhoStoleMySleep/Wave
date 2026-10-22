import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./apiError";
import { noticeConnectionFailure } from "./apiNotices";
import { fetchWithin } from "./deadline";

vi.mock("./apiNotices", () => ({ noticeConnectionFailure: vi.fn() }));

function hangingFetch(): void {
  vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  })));
}

describe("fetchWithin", () => {
  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("returns the response in time", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("ok")));
    expect((await fetchWithin("/x", {}, 1000)).ok).toBe(true);
  });

  it("turns a stalled request into a timeout error", async () => {
    hangingFetch();
    const pending = fetchWithin("/x", {}, 1000);
    vi.advanceTimersByTime(1000);
    await expect(pending).rejects.toMatchObject({ status: 0, code: "TIMEOUT_ERROR" });
    expect(noticeConnectionFailure).toHaveBeenCalledWith("timeout");
  });

  it("turns a refused connection into a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(fetchWithin("/x", {}, 1000)).rejects.toMatchObject({ status: 0, code: "NETWORK_ERROR" });
    expect(noticeConnectionFailure).toHaveBeenCalledWith("network");
  });

  it("keeps quiet about a timeout the caller copes with", async () => {
    hangingFetch();
    const pending = fetchWithin("/x", {}, 1000, { quiet: true });
    vi.advanceTimersByTime(1000);
    await expect(pending).rejects.toMatchObject({ code: "TIMEOUT_ERROR" });
    expect(noticeConnectionFailure).not.toHaveBeenCalled();
  });

  it("passes the caller's abort through without a notice", async () => {
    hangingFetch();
    const caller = new AbortController();
    const pending = fetchWithin("/x", { signal: caller.signal }, 1000);
    caller.abort();
    const error = await pending.catch((reason: unknown) => reason);
    expect(error).not.toBeInstanceOf(ApiError);
    expect(noticeConnectionFailure).not.toHaveBeenCalled();
  });
});
