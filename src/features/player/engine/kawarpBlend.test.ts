import { describe, expect, it } from "vitest";
import { CoverBlend } from "./kawarpBlend";

describe("CoverBlend", () => {
  it("has no weight before it starts", () => {
    expect(new CoverBlend(1000).weight(500)).toBeNull();
  });

  it("eases from zero through the midpoint", () => {
    const blend = new CoverBlend(1000);
    blend.start(100);
    expect(blend.weight(100)).toBe(0);
    expect(blend.weight(600)).toBeCloseTo(0.5);
    expect(blend.weight(350)).toBeLessThan(0.25);
  });

  it("treats a timestamp before the start as the start", () => {
    const blend = new CoverBlend(1000);
    blend.start(100);
    expect(blend.weight(50)).toBe(0);
  });

  it("ends exactly at the duration", () => {
    const blend = new CoverBlend(1000);
    blend.start(0);
    expect(blend.weight(999)).not.toBeNull();
    expect(blend.weight(1000)).toBeNull();
  });
});
