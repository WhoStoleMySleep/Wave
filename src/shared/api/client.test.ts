import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordConnectivityFailure, recordConnectivitySuccess } from "@/features/connectivity";
import { noticeServerError } from "./apiNotices";
import { getAuthSession, getValidAccessToken, refreshAuthSession, type AuthTokens } from "./auth-session";
import { openEventStream, request, requestNoContent } from "./client";

vi.mock("@/features/connectivity", () => ({
  isConnectivityFailure: (error: { status?: number }) => error?.status === 0 || error?.status === 502,
  recordConnectivityFailure: vi.fn(),
  recordConnectivitySuccess: vi.fn(),
  statusOf: (error: { status?: number }) => error?.status,
  stripQuery: (path: string) => path.split("?")[0],
}));
vi.mock("./apiNotices", () => ({ noticeServerError: vi.fn(), noticeConnectionFailure: vi.fn() }));
vi.mock("./auth-session", () => ({
  getAuthSession: vi.fn(),
  getSessionExpiryMs: (session: AuthTokens) => Date.parse(session.accessTokenExpiresAt),
  getValidAccessToken: vi.fn(),
  refreshAuthSession: vi.fn(),
}));

const fetchMock = vi.fn();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function authHeader(call: number): string | undefined {
  const init = fetchMock.mock.calls[call][1] as RequestInit;
  return (init.headers as Record<string, string>).Authorization;
}

function session(accessToken: string, refreshToken?: string): AuthTokens {
  return { accessToken, refreshToken, accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString() } as AuthTokens;
}

describe("api client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(getValidAccessToken).mockResolvedValue("token-1");
    vi.mocked(getAuthSession).mockReturnValue(session("token-1", "refresh-1"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.mocked(refreshAuthSession).mockReset();
    fetchMock.mockReset();
  });

  it("sends the body as JSON with the bearer token", async () => {
    fetchMock.mockResolvedValue(json({ id: "p1" }));
    expect(await request("/v1/me/playlists", { method: "POST", body: { title: "Mix" } })).toEqual({ id: "p1" });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.body).toBe('{"title":"Mix"}');
    expect(init.headers).toMatchObject({ "Content-Type": "application/json", Authorization: "Bearer token-1" });
    expect(recordConnectivitySuccess).toHaveBeenCalled();
  });

  it("sends no token for anonymous calls", async () => {
    fetchMock.mockResolvedValue(json({}));
    await request("/v1/auth/login", { method: "POST", body: {}, anonymous: true });
    expect(authHeader(0)).toBeUndefined();
    expect(getValidAccessToken).not.toHaveBeenCalled();
  });

  it("refreshes the session once after a 401 and retries", async () => {
    fetchMock.mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json({ ok: true }));
    vi.mocked(refreshAuthSession).mockResolvedValue(session("token-2"));
    expect(await request("/v1/me")).toEqual({ ok: true });
    expect(authHeader(1)).toBe("Bearer token-2");
  });

  it("retries with a token a parallel request already rotated", async () => {
    fetchMock.mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json({}));
    vi.mocked(getAuthSession).mockReturnValue(session("rotated", "r"));
    await requestNoContent("/v1/me/library/tracks/t1", { method: "PUT" });
    expect(authHeader(1)).toBe("Bearer rotated");
    expect(refreshAuthSession).not.toHaveBeenCalled();
  });

  it("lets the 401 stand when the server rejected the refresh token", async () => {
    fetchMock.mockResolvedValue(json({ code: "UNAUTHORIZED", message: "expired" }, 401));
    vi.mocked(refreshAuthSession).mockResolvedValue(null);
    vi.mocked(getAuthSession).mockReturnValueOnce(session("token-1", "refresh-1")).mockReturnValue(null);
    await expect(request("/v1/me")).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports a network failure when the refresh could not reach the server", async () => {
    fetchMock.mockResolvedValue(json({}, 401));
    vi.mocked(refreshAuthSession).mockResolvedValue(null);
    await expect(request("/v1/me")).rejects.toMatchObject({ status: 0, code: "NETWORK_ERROR" });
  });

  it("keeps a still-valid token when the proactive refresh failed", async () => {
    vi.mocked(getValidAccessToken).mockResolvedValue(null);
    fetchMock.mockResolvedValue(json({}));
    await request("/v1/me/history");
    expect(authHeader(0)).toBe("Bearer token-1");
  });

  it("shares one in-flight GET between identical calls", async () => {
    fetchMock.mockResolvedValue(json({ items: [] }));
    const [first, second] = await Promise.all([request("/v1/me/playlists"), request("/v1/me/playlists")]);
    expect(first).toBe(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("runs a GET with its own signal separately", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json({})));
    const signal = new AbortController().signal;
    await Promise.all([request("/v1/search", { signal }), request("/v1/search", { signal })]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("notices server errors and records gateway failures", async () => {
    fetchMock.mockResolvedValue(json({ message: "upstream" }, 502));
    await expect(request("/v1/tracks/x?q=1")).rejects.toMatchObject({ status: 502, message: "upstream" });
    expect(noticeServerError).toHaveBeenCalledWith(502);
    expect(recordConnectivityFailure).toHaveBeenCalledWith(expect.objectContaining({ path: "/v1/tracks/x", status: 502 }));
  });

  it("keeps a quiet call's server error to the caller", async () => {
    fetchMock.mockResolvedValue(json({ message: "upstream" }, 500));
    await expect(request("/v1/tracks/x/playback", { method: "POST", quiet: true })).rejects.toMatchObject({ status: 500 });
    expect(noticeServerError).not.toHaveBeenCalled();
  });

  it("rejects an event stream the server refused", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404, statusText: "Not Found" }));
    await expect(openEventStream("/v1/tracks/x/lyrics")).rejects.toMatchObject({ status: 404 });
  });
});
