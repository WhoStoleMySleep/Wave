import { describe, expect, it } from "vitest";
import { ApiError } from "@/shared/api";
import { authErrorMessage, getAuthErrorCode } from "./authErrors";

describe("getAuthErrorCode", () => {
  it("maps known server codes", () => {
    expect(getAuthErrorCode(new ApiError(409, "", "USERNAME_TAKEN"))).toBe("username_taken");
  });

  it("separates an unreachable server from an unknown answer", () => {
    expect(getAuthErrorCode(new TypeError("fetch failed"))).toBe("server_unavailable");
    expect(getAuthErrorCode(new ApiError(500, "boom"))).toBe("unknown_error");
  });
});

describe("authErrorMessage", () => {
  it("explains known server codes", () => {
    expect(authErrorMessage(new ApiError(401, "", "INVALID_CREDENTIALS"))).toBe("Email or password is incorrect.");
  });

  it("never shows the raw server message", () => {
    expect(authErrorMessage(new ApiError(500, "<html>stack</html>", "INVALID_INPUT"))).toBe("Something went wrong. Please try again.");
    expect(authErrorMessage(null)).toBe("Unable to reach the server.");
  });
});
