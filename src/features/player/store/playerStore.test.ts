import { beforeEach, describe, expect, it } from "vitest";
import type { Track } from "@/shared/types";
import { INITIAL_PLAYER_STATE } from "./playerDefaults";
import { usePlayerStore } from "./playerStore";

const first = { id: "a", title: "A" } as Track;
const second = { id: "b", title: "B" } as Track;
const context = { playbackContext: "playlist:1", playbackContextCover: "cover", playbackContextTitle: "Mix" };

describe("usePlayerStore", () => {
  beforeEach(() => usePlayerStore.setState(INITIAL_PLAYER_STATE));

  it("resets the position when the track changes", () => {
    usePlayerStore.setState({ currentTrack: first, positionMs: 5000 });
    usePlayerStore.getState().setCurrentTrack(second, 1);
    expect(usePlayerStore.getState()).toMatchObject({ currentTrack: second, currentIndex: 1, positionMs: 0 });
  });

  it("keeps the position when the same track is set again", () => {
    usePlayerStore.setState({ currentTrack: first, positionMs: 5000 });
    usePlayerStore.getState().setCurrentTrack(first, 3);
    expect(usePlayerStore.getState()).toMatchObject({ currentIndex: 3, positionMs: 5000 });
  });

  it("keeps the playing track when the queue is cleared", () => {
    usePlayerStore.setState({ ...context, currentTrack: first, queue: [first, second], currentIndex: 0, fullscreen: true });
    usePlayerStore.getState().clearQueue();
    expect(usePlayerStore.getState()).toMatchObject({ queue: [first], currentIndex: 0, playbackContext: null, fullscreen: true });
  });

  it("empties everything and closes the fullscreen player when nothing plays", () => {
    usePlayerStore.setState({ ...context, queue: [second], fullscreen: true });
    usePlayerStore.getState().clearQueue();
    expect(usePlayerStore.getState()).toMatchObject({ queue: [], currentIndex: -1, currentTrack: null, playbackContextTitle: null, fullscreen: false });
  });

  it("does not notify subscribers when fullscreen does not change", () => {
    let notified = 0;
    const unsubscribe = usePlayerStore.subscribe(() => notified++);
    usePlayerStore.getState().setFullscreen(false);
    unsubscribe();
    expect(notified).toBe(0);
  });
});
