import { useEffect } from "react";
import { usePlayerState } from "@/features/player/hooks/usePlayerState";
import { useIsTrackLiked } from "@/features/library/hooks";
import { useCoverSrc } from "@/features/covers";
import { getAuthSession } from "@/shared/api";
import { useOverlaySettingsStore } from "../store/overlaySettingsStore";
import { handleOverlayAction, toOverlayState } from "../lib/overlayState";

function pushSettings() {
  const { enabled, position, shortcut, autoShowOnMinimize, alwaysOnTop } = useOverlaySettingsStore.getState();
  window.waveNative?.updateOverlaySettings?.({ enabled, position, shortcut, autoShowOnMinimize, alwaysOnTop });
}

/** The overlay shows the signed-in user's playback, so it closes as soon as the session is gone. */
function closeOnSignOut() {
  if (getAuthSession()) return;
  window.waveNative?.closeOverlay?.();
  window.waveNative?.sendOverlayAction?.({ type: "closeOverlay" });
}

export function useOverlaySync() {
  const player = usePlayerState();
  const track = player.currentTrack;
  const cover = useCoverSrc(track?.coverUrl);
  const isLiked = useIsTrackLiked(track?.id);

  useEffect(() => {
    pushSettings();
    window.addEventListener("auth:changed", closeOnSignOut);
    const stopActions = window.waveNative?.onOverlayAction?.(handleOverlayAction);
    return () => {
      window.removeEventListener("auth:changed", closeOnSignOut);
      stopActions?.();
    };
  }, []);

  const { status, positionMs, durationMs, volume } = player;
  useEffect(() => {
    window.waveNative?.overlayUpdateState?.(toOverlayState({ player: { status, positionMs, durationMs, volume }, track, cover, isLiked }));
  }, [status, positionMs, durationMs, volume, track, cover, isLiked]);
}
