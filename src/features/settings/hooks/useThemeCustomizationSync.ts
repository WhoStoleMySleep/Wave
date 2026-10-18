import { useEffect } from "react";
import { useTheme } from "next-themes";
import { isGlassThemeActive, useCustomizationStore } from "../store/customizationStore";

/** Light text on a see-through blurred wallpaper loses contrast, so active glass forces the dark theme. */
export function useThemeCustomizationSync() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const isGlassActive = useCustomizationStore(isGlassThemeActive);

  useEffect(() => {
    if (isGlassActive && (theme === "light" || resolvedTheme === "light")) {
      setTheme("dark");
    }
  }, [isGlassActive, theme, resolvedTheme, setTheme]);

  return { isGlassActive };
}
