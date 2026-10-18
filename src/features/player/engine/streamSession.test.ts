import { describe, expect, it } from "vitest";
import { isSessionExpired, loudnessGain, sessionExpiry } from "./streamSession";

describe("loudnessGain", () => {
  it("turns a louder track down and leaves a quieter one as is", () => {
    expect(loudnessGain(20)).toBeCloseTo(0.1);
    expect(loudnessGain(-6)).toBe(1);
    expect(loudnessGain(0)).toBe(1);
  });

  it("keeps full volume without loudness data", () => {
    expect(loudnessGain(null)).toBe(1);
    expect(loudnessGain(undefined)).toBe(1);
    expect(loudnessGain(Number.NaN)).toBe(1);
  });
});

describe("stream session expiry", () => {
  it("reads the expiry date and drops an invalid one", () => {
    expect(sessionExpiry({ expiresAt: "2026-01-01T00:00:00.000Z" })).toBe(Date.UTC(2026, 0, 1));
    expect(sessionExpiry({ expiresAt: "soon" })).toBeNull();
    expect(sessionExpiry({ expiresAt: "" })).toBeNull();
  });

  it("counts a stream as expired fifteen seconds early", () => {
    expect(isSessionExpired(100_000, 84_999)).toBe(false);
    expect(isSessionExpired(100_000, 85_000)).toBe(true);
    expect(isSessionExpired(null, 0)).toBe(false);
  });
});
