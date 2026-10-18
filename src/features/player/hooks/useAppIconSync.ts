import { useEffect } from "react";
import { useTheme } from "next-themes";
import { usePlayerStore } from "../store/playerStore";
import { ACCENT_LOGOS, invertsInLightTheme } from "../ui/accentLogos";
import { applyAppIcon, renderAppIcon } from "../ui/appIcon";

export function useAppIconSync(): void {
  const accentVariant = usePlayerStore((state) => state.accentVariant);
  const { theme, resolvedTheme } = useTheme();
  const isLight = (resolvedTheme ?? theme) === "light";

  useEffect(() => {
    let isCurrent = true;
    const style = { isLight, invertLogo: invertsInLightTheme(accentVariant) };
    void renderAppIcon(ACCENT_LOGOS[accentVariant], style).then((dataUrl) => {
      if (isCurrent && dataUrl) applyAppIcon(dataUrl);
    });
    return () => {
      isCurrent = false;
    };
  }, [accentVariant, isLight]);
}
