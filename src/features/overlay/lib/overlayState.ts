import { playerEngine } from "@/features/player/engine/playerEngine";
import { toggleTrackLike } from "@/features/library/hooks";
import type { PlayerState } from "@/features/player/store/playerStore";
import type { Track } from "@/shared/types";
import type { OverlayAction, OverlayStatePayload } from "../contracts";

const VOLUME_STEP = 0.05;
const VOLUME_PRECISION = 100;

function stepVolume(delta: number) {
  const volume = playerEngine.getSnapshot().volume + delta;
  playerEngine.setVolume(Math.round(volume * VOLUME_PRECISION) / VOLUME_PRECISION);
}

const HANDLERS: Partial<Record<OverlayAction["type"], (action: OverlayAction) => void>> = {
  togglePlay: () => void playerEngine.togglePlayPause(),
  play: () => void playerEngine.resume(),
  pause: () => playerEngine.pause(),
  next: () => void playerEngine.skipNext(),
  prev: () => void playerEngine.skipPrevious(),
  seek: ({ payload }) => typeof payload?.positionMs === "number" && playerEngine.seek(payload.positionMs),
  like: () => {
    const track = playerEngine.getSnapshot().currentTrack;
    if (track) void toggleTrackLike(track.id);
  },
  volumeUp: () => stepVolume(VOLUME_STEP),
  volumeDown: () => stepVolume(-VOLUME_STEP),
  setVolume: ({ payload }) => typeof payload?.volume === "number" && playerEngine.setVolume(payload.volume),
};

/** Runs a control pressed in the overlay window; window actions are handled by the native side. */
export function handleOverlayAction(action: OverlayAction): void {
  HANDLERS[action.type]?.(action);
}

function artistNames(track: Track): string {
  return track.artists || (track.artistList ?? []).map((artist) => artist.name).filter(Boolean).join(", ");
}

export interface OverlaySource {
  player: Pick<PlayerState, "status" | "positionMs" | "durationMs" | "volume">;
  track: Track | null;
  cover: string | null | undefined;
  isLiked: boolean;
}

export function toOverlayState({ player, track, cover, isLiked }: OverlaySource): OverlayStatePayload {
  const coverUrl = cover || track?.coverUrl;
  return {
    status: player.status,
    track: track
      ? {
          id: track.id,
          title: track.title,
          artist: artistNames(track),
          album: track.album?.title,
          cover: coverUrl,
          coverUrl,
          durationMs: track.durationMs || player.durationMs,
        }
      : null,
    positionMs: player.positionMs,
    durationMs: player.durationMs,
    volume: player.volume,
    isLiked,
  };
}
