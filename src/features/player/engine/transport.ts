import type { Track } from "@/shared/types";
import { usePlayerStore, type PlayerState } from "../store/playerStore";
import { playerRuntime } from "./playerRuntime";

const store = () => usePlayerStore.getState();

/** Keeps a seek inside the track; a track of unknown length lets any forward position through. */
export function clampPosition(positionMs: number, state: Pick<PlayerState, "durationMs" | "currentTrack">): number {
  const durationMs = state.durationMs || state.currentTrack?.durationMs || 0;
  return Math.round(Math.max(0, Math.min(durationMs || positionMs, positionMs)));
}

/** A track still loading is dropped rather than paused, so it can't start playing after the pause. */
export function pausePlayback(): void {
  const wasLoading = store().status === "loading";
  if (wasLoading) playerRuntime?.cancelPendingLoad();
  const positionMs = playerRuntime?.getPositionMs() ?? null;
  usePlayerStore.setState({ status: "paused", error: null, ...(positionMs !== null && { positionMs }) });
  if (!wasLoading) playerRuntime?.pause();
}

/** Resumes on the loaded element, or loads the current track again from where it stopped. */
export function resumePlayback(): void {
  if (!playerRuntime) return;
  const { currentTrack, positionMs } = store();
  if (currentTrack && !playerRuntime.hasLoadedSourceFor(currentTrack.id)) {
    void playerRuntime.loadAndPlay(currentTrack, positionMs);
    return;
  }
  store().setStatus("playing");
  playerRuntime.resume();
}

export function stopPlayback(): void {
  playerRuntime?.pause();
  usePlayerStore.setState({
    status: "idle",
    error: null,
    positionMs: 0,
    durationMs: 0,
    currentTrack: null,
    currentIndex: -1,
  });
}

/**
 * Makes `track` the current one from its start and loads it.
 * @param queue - replaces the queue in the same update, so the UI never shows a track outside it
 */
export function loadTrack(track: Track, index: number, queue?: Track[]): void {
  usePlayerStore.setState({
    ...(queue && { queue }),
    currentTrack: track,
    currentIndex: index,
    positionMs: 0,
    durationMs: track.durationMs ?? 0,
    status: "loading",
    error: null,
  });
  void playerRuntime?.loadAndPlay(track);
}

/** @param autoPlay - start playing from there if paused */
export function seekPlayback(target: number, autoPlay: boolean): void {
  const state = store();
  state.setPosition(target);
  if (!playerRuntime) return;
  const track = state.currentTrack;
  if (track && !playerRuntime.hasLoadedSourceFor(track.id)) {
    seekUnloaded(state, target, autoPlay);
    return;
  }
  playerRuntime.seek(target);
  if (autoPlay && state.status !== "playing") resumePlayback();
}

function seekUnloaded(state: PlayerState, target: number, autoPlay: boolean): void {
  const track = state.currentTrack;
  if (!playerRuntime || !track) return;
  if (playerRuntime.getCurrentTrackId() === track.id && state.status === "loading") {
    playerRuntime.setPendingSeek(target);
    return;
  }
  if (autoPlay || state.status === "playing") void playerRuntime.loadAndPlay(track, target);
}
