import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useTheme } from "next-themes";
import { debouncedStorage } from "@/shared/utils/storage";
import { log } from "@/shared/utils/logger";
import {
  DEFAULT_BLOCK_CONFIG,
  DEFAULT_GLASS_CONFIG,
  MAX_OPACITY,
  clamp,
  clampBlockConfig,
  isOpaque,
  type BlockCustomization,
} from "../lib/blockStyle";
import { loadPersistedWallpaper, savePersistedWallpaper } from "../lib/wallpaperDb";

export * from "../lib/blockStyle";
export { loadPersistedWallpaper } from "../lib/wallpaperDb";

export type CustomizableBlock = "sidebar" | "contentView" | "miniplayer";

export interface CustomizationState {
  backgroundImage: string | null;
  backgroundBlur: number;
  backgroundDim: number;
  sidebar: BlockCustomization;
  contentView: BlockCustomization;
  miniplayer: BlockCustomization;
  setBackgroundImage: (image: string | null) => void;
  setBackgroundBlur: (blur: number) => void;
  setBackgroundDim: (dim: number) => void;
  setBlockConfig: (block: CustomizableBlock, patch: Partial<BlockCustomization>) => void;
  applyToAllBlocks: (sourceBlock: CustomizableBlock) => void;
  resetBlock: (block: CustomizableBlock) => void;
  resetAll: () => void;
}

type WallpaperMessage = { type: "wallpaper_changed"; image: string | null } | { type: "request_wallpaper" };

const MAX_BACKGROUND_BLUR = 40;
const MAX_BACKGROUND_DIM = 85;
const BLOCKS: CustomizableBlock[] = ["sidebar", "contentView", "miniplayer"];

const wallpaperBroadcast =
  typeof window !== "undefined" && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("wave_wallpaper_sync") : null;

function broadcast(message: WallpaperMessage) {
  wallpaperBroadcast?.postMessage(message);
}

function allBlocks(config: BlockCustomization): Pick<CustomizationState, CustomizableBlock> {
  return { sidebar: { ...config }, contentView: { ...config }, miniplayer: { ...config } };
}

const PLAIN = { backgroundBlur: 0, backgroundDim: 0, ...allBlocks(DEFAULT_BLOCK_CONFIG) };

/** The first wallpaper over untouched opaque blocks gets the glass preset, so the wallpaper is visible at all. */
function blocksForWallpaper(state: CustomizationState, image: string | null): Partial<CustomizationState> {
  if (!image) return PLAIN;
  if (state.backgroundImage) return {};
  return BLOCKS.every((block) => isOpaque(state[block])) ? allBlocks(DEFAULT_GLASS_CONFIG) : {};
}

export const useCustomizationStore = create<CustomizationState>()(
  persist(
    (set) => ({
      backgroundImage: null,
      ...PLAIN,

      setBackgroundImage: (image) => {
        void savePersistedWallpaper(image);
        broadcast({ type: "wallpaper_changed", image });
        set((state) => ({ ...blocksForWallpaper(state, image), backgroundImage: image }));
      },

      setBackgroundBlur: (blur) => set({ backgroundBlur: clamp(blur, 0, MAX_BACKGROUND_BLUR) }),

      setBackgroundDim: (dim) => set({ backgroundDim: clamp(dim, 0, MAX_BACKGROUND_DIM) }),

      setBlockConfig: (block, patch) => set((state) => ({ [block]: clampBlockConfig({ ...state[block], ...patch }) })),

      applyToAllBlocks: (sourceBlock) => set((state) => allBlocks(state[sourceBlock])),

      resetBlock: (block) =>
        set((state) => ({ [block]: { ...(state.backgroundImage ? DEFAULT_GLASS_CONFIG : DEFAULT_BLOCK_CONFIG) } })),

      resetAll: () => {
        void savePersistedWallpaper(null);
        broadcast({ type: "wallpaper_changed", image: null });
        set({ backgroundImage: null, ...PLAIN });
      },
    }),
    {
      name: "wave_customization_v1",
      storage: createJSONStorage(() => debouncedStorage),
      partialize: (state) => ({
        backgroundBlur: state.backgroundBlur,
        backgroundDim: state.backgroundDim,
        sidebar: state.sidebar,
        contentView: state.contentView,
        miniplayer: state.miniplayer,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        BLOCKS.forEach((block) => (state[block] = clampBlockConfig(state[block] ?? {})));
        void restoreWallpaper();
      },
    },
  ),
);

/** Another open window may hold a newer wallpaper than storage, so it is asked as well. */
async function restoreWallpaper() {
  broadcast({ type: "request_wallpaper" });
  const image = await loadPersistedWallpaper();
  if (image) useCustomizationStore.setState({ backgroundImage: image });
}

function onWallpaperMessage(message: WallpaperMessage) {
  if (message.type === "wallpaper_changed") return useCustomizationStore.setState({ backgroundImage: message.image });
  const current = useCustomizationStore.getState().backgroundImage;
  if (current) broadcast({ type: "wallpaper_changed", image: current });
}

if (wallpaperBroadcast) {
  wallpaperBroadcast.onmessage = (event: MessageEvent<WallpaperMessage | null>) => {
    if (event.data?.type) onWallpaperMessage(event.data);
  };
}

function storedTheme(): string | null {
  try {
    return localStorage.getItem("theme");
  } catch (error) {
    log("yellow", "settings", "saved theme is unreadable", error);
    return null;
  }
}

/** Before next-themes resolves, the theme comes from the page attribute, then the saved choice, then the system. */
function getIsDarkTheme(): boolean {
  if (typeof document === "undefined") return false;
  const theme = [document.documentElement.getAttribute("data-theme"), storedTheme()].find((value) => value === "dark" || value === "light");
  if (theme) return theme === "dark";
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
}

export function useIsContentTransparent(): boolean {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme ? resolvedTheme === "dark" : getIsDarkTheme();
  const backgroundImage = useCustomizationStore((state) => state.backgroundImage);
  const opacity = useCustomizationStore((state) => state.contentView.opacity);
  return Boolean(isDark && backgroundImage && opacity < MAX_OPACITY);
}
