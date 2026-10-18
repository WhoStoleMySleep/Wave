import { getAndroidShell, type AndroidMediaState } from "@/platform/android";
import { isTrackLiked, subscribeLikedTracks, toggleTrackLike } from "@/features/library/hooks";
import { usePlayerStore, type PlayerStore } from "../store/playerStore";

/** Further than this from where the native clock expects, the position is a seek. */
const SEEK_THRESHOLD_MS = 1500;

/**
 * Mirrors the player into the Android media session and routes its controls
 * back. The native side extrapolates the position from the playback rate, so
 * timeupdate ticks are only forwarded when they break that extrapolation.
 */
export function installAndroidMediaSync(): void {
  const shell = getAndroidShell();
  if (!shell) return;

  // the phone has no volume slider, only the system volume keys
  usePlayerStore.getState().setVolume(1);

  const toggleLike = () => {
    const track = usePlayerStore.getState().currentTrack;
    if (track) void toggleTrackLike(track.id);
  };

  window.__waveMediaAction = (action, positionMs) => {
    const { dispatch } = usePlayerStore.getState();
    if (action === "play") dispatch({ type: "RESUME_REQUESTED" });
    else if (action === "pause") dispatch({ type: "PAUSE_REQUESTED" });
    else if (action === "next") dispatch({ type: "SKIP_NEXT" });
    else if (action === "previous") dispatch({ type: "SKIP_PREVIOUS" });
    else if (action === "seek") dispatch({ type: "SEEK_COMMITTED", positionMs });
    else if (action === "like") toggleLike();
  };

  let sent: (AndroidMediaState & { trackId: string; at: number }) | null = null;

  const sync = (state: PlayerStore) => {
    const track = state.currentTrack;
    if (!track || state.status === "idle") {
      if (sent) shell.clearMedia();
      sent = null;
      return;
    }

    // Loading keeps the previous state, also when moving to the next track: a
    // "paused" here lets the service leave the foreground, and Android then
    // freezes the backgrounded app before the next track can load.
    const playing = state.status === "loading" && sent ? sent.playing : state.status === "playing";
    const next: AndroidMediaState = {
      title: track.title,
      artist: track.artists,
      album: track.album?.title ?? "",
      artworkUrl: track.coverUrl,
      durationMs: state.durationMs || track.durationMs,
      positionMs: state.positionMs,
      playing,
      rate: 1,
      liked: isTrackLiked(track.id),
    };

    if (sent && sent.trackId === track.id) {
      const elapsed = sent.playing ? (performance.now() - sent.at) * sent.rate : 0;
      const drift = Math.abs(next.positionMs - (sent.positionMs + elapsed));
      const unchanged =
        sent.playing === next.playing &&
        sent.durationMs === next.durationMs &&
        sent.rate === next.rate &&
        sent.artworkUrl === next.artworkUrl &&
        sent.liked === next.liked &&
        drift < SEEK_THRESHOLD_MS;
      if (unchanged) return;
    }

    sent = { ...next, trackId: track.id, at: performance.now() };
    shell.updateMedia(JSON.stringify(next));
  };

  usePlayerStore.subscribe(sync);
  subscribeLikedTracks(() => sync(usePlayerStore.getState()));
  sync(usePlayerStore.getState());
}
