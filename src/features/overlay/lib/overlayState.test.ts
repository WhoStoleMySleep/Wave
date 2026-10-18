import { beforeEach, describe, expect, it, vi } from "vitest";
import { playerEngine } from "@/features/player/engine/playerEngine";
import { toggleTrackLike } from "@/features/library/hooks";
import type { Track } from "@/shared/types";
import { handleOverlayAction, toOverlayState } from "./overlayState";

vi.mock("@/features/player/engine/playerEngine", () => ({
  playerEngine: {
    getSnapshot: vi.fn(),
    setVolume: vi.fn(),
    seek: vi.fn(),
    togglePlayPause: vi.fn(),
  },
}));
vi.mock("@/features/library/hooks", () => ({ toggleTrackLike: vi.fn() }));

const track = { id: "t1", title: "Song", artists: "", artistList: [{ name: "A" }, { name: "B" }], coverUrl: "c", durationMs: 0, playCount: 0 } as Track;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(playerEngine.getSnapshot).mockReturnValue({ volume: 0.97, currentTrack: track } as ReturnType<typeof playerEngine.getSnapshot>);
});

describe("handleOverlayAction", () => {
  it("steps the volume and rounds it", () => {
    handleOverlayAction({ type: "volumeUp" });
    expect(playerEngine.setVolume).toHaveBeenCalledWith(1.02);
    handleOverlayAction({ type: "volumeDown" });
    expect(playerEngine.setVolume).toHaveBeenLastCalledWith(0.92);
  });

  it("seeks only with a position", () => {
    handleOverlayAction({ type: "seek" });
    handleOverlayAction({ type: "seek", payload: { positionMs: 5000 } });
    expect(playerEngine.seek).toHaveBeenCalledOnce();
    expect(playerEngine.seek).toHaveBeenCalledWith(5000);
  });

  it("toggles the like of the playing track", () => {
    handleOverlayAction({ type: "like" });
    expect(toggleTrackLike).toHaveBeenCalledWith("t1");
  });

  it("leaves window actions alone", () => {
    expect(() => handleOverlayAction({ type: "focusMainWindow" })).not.toThrow();
  });
});

describe("toOverlayState", () => {
  const player = { status: "playing" as const, positionMs: 10, durationMs: 200, volume: 0.5 };

  it("names the artists from the list when the string is empty and prefers the cached cover", () => {
    const state = toOverlayState({ player, track, cover: "blob:cover", isLiked: true });
    expect(state.track).toMatchObject({ artist: "A, B", cover: "blob:cover", coverUrl: "blob:cover", durationMs: 200 });
    expect(state.isLiked).toBe(true);
  });

  it("sends no track when nothing plays", () => {
    expect(toOverlayState({ player, track: null, cover: null, isLiked: false }).track).toBeNull();
  });
});
