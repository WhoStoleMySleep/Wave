import defaultLogo from "@/assets/branding/logo-default.svg";
import spotifyLogo from "@/assets/branding/logo-spotify.svg";
import discordLogo from "@/assets/branding/logo-discord.svg";
import telegramLogo from "@/assets/branding/logo-telegram.svg";
import auroraLogo from "@/assets/branding/logo-aurora.svg";
import sunsetLogo from "@/assets/branding/logo-sunset.svg";
import oceanLogo from "@/assets/branding/logo-ocean.svg";
import forestLogo from "@/assets/branding/logo-forest.svg";
import berryLogo from "@/assets/branding/logo-berry.svg";
import carbonLogo from "@/assets/branding/logo-carbon.svg";
import pixelLogo from "@/assets/branding/logo-pixel.svg";
import scanlinesLogo from "@/assets/branding/logo-scanlines.svg";
import vhsLogo from "@/assets/branding/logo-vhs.svg";
import type { AccentVariant } from "../store/accentVariants";

export const ACCENT_LOGOS: Record<AccentVariant, string> = {
  default: defaultLogo,
  spotify: spotifyLogo,
  discord: discordLogo,
  telegram: telegramLogo,
  aurora: auroraLogo,
  sunset: sunsetLogo,
  ocean: oceanLogo,
  forest: forestLogo,
  berry: berryLogo,
  carbon: carbonLogo,
  pixel: pixelLogo,
  scanlines: scanlinesLogo,
  vhs: vhsLogo,
};

const MONOCHROME_VARIANTS: ReadonlySet<AccentVariant> = new Set(["default", "carbon", "pixel", "scanlines"]);

/** Monochrome logos are drawn in light ink for the dark theme and would vanish on a light background. */
export function invertsInLightTheme(variant: AccentVariant): boolean {
  return MONOCHROME_VARIANTS.has(variant);
}

export function accentLogoThemeClass(variant: AccentVariant): string {
  return invertsInLightTheme(variant) ? "theme-logo invert dark:invert-0" : "";
}
