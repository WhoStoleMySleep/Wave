import type { Track } from "@/shared/types";
import { log } from "@/shared/utils/logger";
import type { PlayerCommand } from "../store/playerStore";
import { errorMessage } from "./engineUtils";

const MS_PER_SECOND = 1000;
const ARTWORK_SIZES = ["96x96", "256x256", "512x512"];
const FALLBACK_ALBUM = "Wave";

type Dispatch = (command: PlayerCommand) => void;

function hasMediaSession(): boolean {
  return typeof navigator !== "undefined" && "mediaSession" in navigator;
}

function seekCommand(details: MediaSessionActionDetails): PlayerCommand | null {
  if (details.seekTime === undefined || Number.isNaN(details.seekTime)) return null;
  return { type: "SEEK_COMMITTED", positionMs: Math.round(details.seekTime * MS_PER_SECOND) };
}

export function installMediaSessionHandlers(dispatch: Dispatch): void {
  if (!hasMediaSession()) return;
  const seek: MediaSessionActionHandler = (details) => {
    const command = seekCommand(details);
    if (command) dispatch(command);
  };
  const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
    ["play", () => dispatch({ type: "RESUME_REQUESTED" })],
    ["pause", () => dispatch({ type: "PAUSE_REQUESTED" })],
    ["previoustrack", () => dispatch({ type: "SKIP_PREVIOUS" })],
    ["nexttrack", () => dispatch({ type: "SKIP_NEXT" })],
    ["seekto", seek],
  ];
  for (const [action, handler] of handlers) {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch (error) {
      log("yellow", "media", `media key "${action}" unsupported: ${errorMessage(error)}`);
    }
  }
}

export function showMediaMetadata(track: Track | null): void {
  if (!hasMediaSession()) return;
  try {
    navigator.mediaSession.metadata = track
      ? new MediaMetadata({
          title: track.title,
          artist: track.artists,
          album: track.album?.title || FALLBACK_ALBUM,
          artwork: track.coverUrl ? ARTWORK_SIZES.map((sizes) => ({ src: track.coverUrl, sizes, type: "image/jpeg" })) : [],
        })
      : null;
  } catch (error) {
    log("yellow", "media", `media metadata failed: ${errorMessage(error)}`);
  }
}

/** Skips the event the device list fires on startup, which is not a real change of output. */
export function watchOutputDevices(onChange: () => void): void {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) return;
  let ready = false;
  navigator.mediaDevices.addEventListener("devicechange", () => {
    if (ready) onChange();
    ready = true;
  });
  navigator.mediaDevices
    .enumerateDevices()
    .then(() => (ready = true))
    .catch((error) => log("yellow", "audio", `device list unavailable: ${errorMessage(error)}`));
}
