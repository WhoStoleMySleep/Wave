import { describe, expect, it } from "vitest";
import { classifyPlayError } from "./playFailures";

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
