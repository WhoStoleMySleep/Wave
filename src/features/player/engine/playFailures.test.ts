import { describe, expect, it } from "vitest";
import { ApiError } from "@/shared/api";
import { classifyPlayError, isNotOnYoutube } from "./playFailures";

const named = (name: string) => Object.assign(new Error(name), { name });

describe("classifyPlayError", () => {
  it("treats an abort as superseded by a newer request", () => {
    expect(classifyPlayError(named("AbortError"))).toBe("superseded");
  });

  it("treats NotAllowedError as autoplay waiting for a gesture", () => {
    expect(classifyPlayError(named("NotAllowedError"))).toBe("blocked");
  });

  it("treats anything else as a failure", () => {
    expect(classifyPlayError(new Error("boom"))).toBe("failed");
    expect(classifyPlayError("boom")).toBe("failed");
  });
});

describe("isNotOnYoutube", () => {
  it("recognises the server saying YouTube has no such track", () => {
    expect(isNotOnYoutube(new ApiError(404, "YouTube has no such track", "NOT_ON_YOUTUBE"))).toBe(true);
  });

  it("leaves other failures alone", () => {
    expect(isNotOnYoutube(new ApiError(404, "Not found", "NOT_FOUND"))).toBe(false);
    expect(isNotOnYoutube(new Error("NOT_ON_YOUTUBE"))).toBe(false);
  });
});
