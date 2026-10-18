import { describe, expect, it } from "vitest";
import { ACCENT_VARIANTS } from "../store/accentVariants";
import { ACCENT_LOGOS, accentLogoThemeClass, invertsInLightTheme } from "./accentLogos";

describe("accentLogos", () => {
  it("has a logo for every variant", () => {
    expect(ACCENT_VARIANTS.every((variant) => Boolean(ACCENT_LOGOS[variant]))).toBe(true);
  });

  it("inverts only monochrome logos in the light theme", () => {
    expect(invertsInLightTheme("carbon")).toBe(true);
    expect(invertsInLightTheme("spotify")).toBe(false);
  });

  it("gives colored logos no theme class", () => {
    expect(accentLogoThemeClass("default")).toBe("theme-logo invert dark:invert-0");
    expect(accentLogoThemeClass("ocean")).toBe("");
  });
});
