import { describe, expect, it } from "vitest";
import { ACCENT_VARIANTS, isAccentVariant } from "./accentVariants";

describe("isAccentVariant", () => {
  it("accepts every known variant", () => {
    expect(ACCENT_VARIANTS.every(isAccentVariant)).toBe(true);
  });

  it("rejects a removed variant and non-strings", () => {
    expect(isAccentVariant("neon")).toBe(false);
    expect(isAccentVariant(undefined)).toBe(false);
    expect(isAccentVariant(1)).toBe(false);
  });
});
