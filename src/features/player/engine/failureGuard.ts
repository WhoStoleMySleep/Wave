import type { Track } from "@/shared/types";
import { showToast } from "@/shared/ui";
import { log } from "@/shared/utils/logger";
import { createTranslatorSync, getStoredLocale } from "@/languages";
import { usePlayerStore } from "../store/playerStore";

const MAX_CONSECUTIVE_FAILURES = 3;

export interface PlaybackFailure {
  trackId: string;
  message: string;
}

export interface FailureActions {
  skip: () => void;
  stop: () => void;
}

const store = () => usePlayerStore.getState();
const translate = (key: string) => createTranslatorSync(getStoredLocale())(key);

function trackLabel(track: Track): string {
  return track.artists ? `${track.title} — ${track.artists}` : track.title;
}

export class FailureGuard {
  private failures = 0;

  constructor(private readonly actions: FailureActions) {}

  public reset(): void {
    this.failures = 0;
  }

  public handle({ trackId, message }: PlaybackFailure): void {
    const track = store().currentTrack;
    if (!track || track.id !== trackId) return;
    this.failures += 1;
    if (this.failures > MAX_CONSECUTIVE_FAILURES) {
      this.giveUp();
      return;
    }
    log("yellow", "playback", `"${track.title}" failed (${message}) — skipping to next`);
    showToast(translate("player.track_unavailable_title"), "error", { description: trackLabel(track) });
    this.actions.skip();
  }

  private giveUp(): void {
    log("red", "playback", `${this.failures} consecutive tracks failed to play — stopping instead of skipping further`);
    showToast(translate("player.playback_stopped_too_many_errors"), "error");
    this.failures = 0;
    this.actions.stop();
  }
}
