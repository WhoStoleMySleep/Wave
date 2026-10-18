import { describe, expect, it } from "vitest";
import { toVolumeGain, toVolumeLevel } from "./volume";

describe("volume", () => {
  it("squares the slider level into gain", () => {
    expect(toVolumeGain(0.5)).toBe(0.25);
    expect(toVolumeLevel(0.25)).toBe(0.5);
  });

  it("round-trips a slider level", () => {
    expect(toVolumeLevel(toVolumeGain(0.75))).toBeCloseTo(0.75);
  });

  it("clamps values outside the unit range", () => {
    expect(toVolumeGain(1.5)).toBe(1);
    expect(toVolumeGain(-0.2)).toBe(0);
    expect(toVolumeLevel(Infinity)).toBe(1);
  });

  it("turns NaN into silence instead of passing it to the audio element", () => {
    expect(toVolumeGain(Number.NaN)).toBe(0);
    expect(toVolumeLevel(Number.NaN)).toBe(0);
  });
});
