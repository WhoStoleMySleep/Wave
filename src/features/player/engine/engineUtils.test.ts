import { afterEach, describe, expect, it, vi } from "vitest";
import { elapsedMs, kilobytes, renew } from "./engineUtils";

describe("engine utils", () => {
  afterEach(() => vi.restoreAllMocks());

  it("aborts the previous controller when renewing", () => {
    const first = renew(null);
    const second = renew(first);
    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
  });

  it("measures whole milliseconds since a moment", () => {
    vi.spyOn(performance, "now").mockReturnValue(1250.6);
    expect(elapsedMs(1000)).toBe(251);
  });

  it("rounds bytes to kilobytes", () => {
    expect(kilobytes(1536)).toBe(2);
    expect(kilobytes(0)).toBe(0);
  });
});
