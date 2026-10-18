import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_CHANGED_EVENT,
  AUTH_STORAGE_KEY,
  clearAuthSession,
  getAuthSession,
  getSessionExpiryMs,
  getValidAccessToken,
  refreshAuthSession,
  setAuthSession,
  type AuthTokens,
} from "./auth-session";


const fetchMock = vi.fn();

function sessionExpiringIn(ms: number, overrides: Partial<AuthTokens> = {}): AuthTokens {
  return {
    accessToken: "access-1",
    refreshToken: "refresh-1",
    accessTokenExpiresAt: new Date(Date.now() + ms).toISOString(),
    user: { id: "u1", username: "me" },
    ...overrides,
  } as AuthTokens;
}

function tokensResponse(accessToken: string, refreshToken: string): Response {
  const body = { accessToken, refreshToken, accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString() };
  return new Response(JSON.stringify(body), { status: 200 });
}

describe("auth session", () => {
  beforeEach(() => {
    setAuthSession(null);
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("stores the session and announces the change", () => {
    const listener = vi.fn();
    window.addEventListener(AUTH_CHANGED_EVENT, listener);
    setAuthSession(sessionExpiringIn(60_000));
    window.removeEventListener(AUTH_CHANGED_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) ?? "null").accessToken).toBe("access-1");
  });

  it("picks up a session another window stored while this one had none", () => {
    expect(getAuthSession()).toBeNull();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(sessionExpiringIn(60_000)));
    expect(getAuthSession()?.accessToken).toBe("access-1");
  });

  it("treats an unreadable stored session as signed out", () => {
    localStorage.setItem(AUTH_STORAGE_KEY, "{broken");
    expect(getAuthSession()).toBeNull();
  });

  it("parses the expiry the server sends", () => {
    const session = sessionExpiringIn(0, { accessTokenExpiresAt: "2026-10-17T12:00:00+00:00" });
    expect(getSessionExpiryMs(session)).toBe(Date.UTC(2026, 9, 17, 12));
    expect(getSessionExpiryMs(sessionExpiringIn(0, { accessTokenExpiresAt: "soon" }))).toBeNull();
    expect(getSessionExpiryMs(null)).toBeNull();
  });

  it("shares one refresh between parallel callers", async () => {
    setAuthSession(sessionExpiringIn(60_000));
    fetchMock.mockResolvedValue(tokensResponse("access-2", "refresh-2"));
    const [first, second] = await Promise.all([refreshAuthSession(), refreshAuthSession()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(getAuthSession()).toMatchObject({ accessToken: "access-2", refreshToken: "refresh-2", user: { id: "u1" } });
  });

  it("returns the current token while it has time left", async () => {
    setAuthSession(sessionExpiringIn(600_000));
    expect(await getValidAccessToken()).toBe("access-1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes a token about to expire", async () => {
    setAuthSession(sessionExpiringIn(60_000));
    fetchMock.mockResolvedValue(tokensResponse("access-2", "refresh-2"));
    expect(await getValidAccessToken()).toBe("access-2");
  });

  it("waits for a refresh already in flight", async () => {
    setAuthSession(sessionExpiringIn(600_000));
    fetchMock.mockResolvedValue(tokensResponse("access-2", "refresh-2"));
    const refreshing = refreshAuthSession();
    expect(await getValidAccessToken()).toBe("access-2");
    await refreshing;
  });

  it("keeps a live token when the refresh cannot reach the server", async () => {
    setAuthSession(sessionExpiringIn(60_000));
    fetchMock.mockRejectedValue(new TypeError("offline"));
    expect(await getValidAccessToken()).toBe("access-1");
    expect(getAuthSession()).not.toBeNull();
  });

  it("gives up on an expired token whose refresh failed", async () => {
    setAuthSession(sessionExpiringIn(-1000));
    fetchMock.mockRejectedValue(new TypeError("offline"));
    expect(await getValidAccessToken()).toBeNull();
  });

  it("signs out when the server revokes the refresh token, but not on a server error", async () => {
    setAuthSession(sessionExpiringIn(60_000));
    fetchMock.mockResolvedValueOnce(new Response("", { status: 500 }));
    expect(await refreshAuthSession()).toBeNull();
    expect(getAuthSession()).not.toBeNull();
    fetchMock.mockResolvedValueOnce(new Response("", { status: 401 }));
    expect(await refreshAuthSession()).toBeNull();
    expect(getAuthSession()).toBeNull();
  });

  it("does not bring back a session signed out during its refresh", async () => {
    setAuthSession(sessionExpiringIn(60_000));
    let answer: (response: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    const refreshing = refreshAuthSession();
    setAuthSession(null);
    answer(tokensResponse("access-2", "refresh-2"));
    expect(await refreshing).toBeNull();
    expect(getAuthSession()).toBeNull();
  });

  it("signs out locally first and revokes the refresh token on the server", async () => {
    setAuthSession(sessionExpiringIn(60_000));
    fetchMock.mockImplementation(() => {
      expect(getAuthSession()).toBeNull();
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    await clearAuthSession();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/v1\/auth\/logout$/);
    expect(init.body).toBe('{"refreshToken":"refresh-1"}');
  });

  it("signs out even when the server is unreachable", async () => {
    setAuthSession(sessionExpiringIn(60_000));
    fetchMock.mockRejectedValue(new TypeError("offline"));
    await expect(clearAuthSession()).resolves.toBeUndefined();
    expect(getAuthSession()).toBeNull();
  });
});
