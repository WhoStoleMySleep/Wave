import { describe, expect, it } from "vitest";
import { ApiError, apiErrorFrom, resolveApiErrorMessage } from "./apiError";

const t = (key: string) => `t:${key}`;

describe("resolveApiErrorMessage", () => {
  it.each([
    [0, "common.error_network"],
    [401, "common.error_session_expired"],
    [403, "common.error_session_expired"],
    [404, "common.error_not_found"],
    [429, "common.error_too_many"],
    [503, "common.error_server"],
  ])("maps status %i to %s", (status, key) => {
    expect(resolveApiErrorMessage(new ApiError(status, "raw"), t, "fallback")).toBe(`t:${key}`);
  });

  it("uses the fallback for other statuses and non-API errors", () => {
    expect(resolveApiErrorMessage(new ApiError(400, "raw"), t, "fallback")).toBe("t:fallback");
    expect(resolveApiErrorMessage(new TypeError("boom"), t, "fallback")).toBe("t:fallback");
  });
});

describe("apiErrorFrom", () => {
  it("reads the server's code and message", async () => {
    const response = new Response(JSON.stringify({ code: "PLAYLIST_STALE", message: "stale" }), { status: 409 });
    const error = await apiErrorFrom(response);
    expect(error).toMatchObject({ status: 409, code: "PLAYLIST_STALE", message: "stale" });
  });

  it("falls back to the status text for a body that is not JSON", async () => {
    const error = await apiErrorFrom(new Response("<html>", { status: 502, statusText: "Bad Gateway" }));
    expect(error).toMatchObject({ status: 502, code: undefined, message: "Bad Gateway" });
  });
});
