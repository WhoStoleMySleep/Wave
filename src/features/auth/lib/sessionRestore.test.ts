import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, getAuthSession, refreshAuthSession, setAuthSession, type AuthTokens, type PublicUser } from "@/shared/api";
import { restoreSession } from "./sessionRestore";

vi.mock("@/shared/api", async () => {
  const { ApiError } = await vi.importActual<typeof import("@/shared/api/apiError")>("@/shared/api/apiError");
  return {
    ApiError,
    api: { getMe: vi.fn() },
    getAuthSession: vi.fn(),
    setAuthSession: vi.fn(),
    refreshAuthSession: vi.fn(),
  };
});

const storedUser = { id: "u1", username: "old" } as PublicUser;
const stored = { accessToken: "a", refreshToken: "r", accessTokenExpiresAt: "", user: storedUser } as AuthTokens;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuthSession).mockReturnValue(stored);
});

describe("restoreSession", () => {
  it("saves the fresh profile", async () => {
    const fresh = { id: "u1", username: "new" } as PublicUser;
    vi.mocked(api.getMe).mockResolvedValue(fresh);
    expect(await restoreSession(stored)).toEqual({ status: "authenticated", user: fresh });
    expect(setAuthSession).toHaveBeenCalledWith({ ...stored, user: fresh });
  });

  it("stays signed in when the server is unreachable", async () => {
    vi.mocked(api.getMe).mockRejectedValue(new TypeError("fetch failed"));
    expect(await restoreSession(stored)).toEqual({ status: "authenticated", user: storedUser });
    expect(setAuthSession).not.toHaveBeenCalled();
  });

  it("gives up on a profile request that hangs", async () => {
    vi.useFakeTimers();
    vi.mocked(api.getMe).mockReturnValue(new Promise(() => {}));
    const restoring = restoreSession(stored);
    await vi.advanceTimersByTimeAsync(6000);
    expect(await restoring).toEqual({ status: "authenticated", user: storedUser });
    vi.useRealTimers();
  });

  it("refreshes a rejected token", async () => {
    const fresh = { id: "u1", username: "after" } as PublicUser;
    vi.mocked(api.getMe).mockRejectedValueOnce(new ApiError(401, "expired")).mockResolvedValueOnce(fresh);
    vi.mocked(refreshAuthSession).mockResolvedValue({ ...stored, accessToken: "b" });
    expect(await restoreSession(stored)).toEqual({ status: "authenticated", user: fresh });
  });

  it("keeps the session when the refresh did not reach the server", async () => {
    vi.mocked(api.getMe).mockRejectedValue(new ApiError(401, "expired"));
    vi.mocked(refreshAuthSession).mockResolvedValue(null);
    expect(await restoreSession(stored)).toEqual({ status: "authenticated", user: storedUser });
  });

  it("signs out once the refresh token is revoked", async () => {
    vi.mocked(api.getMe).mockRejectedValue(new ApiError(403, "revoked"));
    vi.mocked(refreshAuthSession).mockImplementation(async () => {
      vi.mocked(getAuthSession).mockReturnValue(null);
      return null;
    });
    expect(await restoreSession(stored)).toEqual({ status: "anonymous", user: null });
    expect(setAuthSession).toHaveBeenCalledWith(null);
  });

  it("signs out a rejected session without a refresh token", async () => {
    vi.mocked(getAuthSession).mockReturnValue({ ...stored, refreshToken: "" });
    vi.mocked(api.getMe).mockRejectedValue(new ApiError(401, "expired"));
    expect(await restoreSession(stored)).toEqual({ status: "anonymous", user: null });
    expect(refreshAuthSession).not.toHaveBeenCalled();
  });
});
