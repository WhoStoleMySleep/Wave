import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "@/shared/types";
import { installMediaSessionHandlers, showMediaMetadata, watchOutputDevices } from "./systemMedia";

const handlers = new Map<string, MediaSessionActionHandler>();
const mediaSession = {
  metadata: null as MediaMetadata | null,
  setActionHandler: (action: string, handler: MediaSessionActionHandler) => handlers.set(action, handler),
};

class FakeMetadata {
  constructor(public init: MediaMetadataInit) {}
}

describe("media session", () => {
  beforeEach(() => {
    handlers.clear();
    vi.stubGlobal("MediaMetadata", FakeMetadata);
    Object.defineProperty(navigator, "mediaSession", { value: mediaSession, configurable: true });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("routes media keys to player commands", () => {
    const dispatch = vi.fn();
    installMediaSessionHandlers(dispatch);
    handlers.get("nexttrack")!({ action: "nexttrack" });
    handlers.get("seekto")!({ action: "seekto", seekTime: 12.3456 });
    expect(dispatch).toHaveBeenCalledWith({ type: "SKIP_NEXT" });
    expect(dispatch).toHaveBeenCalledWith({ type: "SEEK_COMMITTED", positionMs: 12346 });
  });

  it("ignores a seek without a time", () => {
    const dispatch = vi.fn();
    installMediaSessionHandlers(dispatch);
    handlers.get("seekto")!({ action: "seekto" });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("shows the album and cover sizes and clears them without a track", () => {
    const track: Track = {
      id: "t",
      title: "Song",
      artists: "Artist",
      durationMs: 1,
      coverUrl: "cover.jpg",
      playCount: 0,
      album: { id: "a", title: "Album" },
    };
    showMediaMetadata(track);
    const init = (mediaSession.metadata as unknown as FakeMetadata).init;
    expect(init.album).toBe("Album");
    expect(init.artwork).toHaveLength(3);
    showMediaMetadata(null);
    expect(mediaSession.metadata).toBeNull();
  });
});

describe("watchOutputDevices", () => {
  it("skips the startup event and reports later changes", async () => {
    const target = new EventTarget();
    const mediaDevices = Object.assign(target, { enumerateDevices: () => new Promise<MediaDeviceInfo[]>(() => {}) });
    Object.defineProperty(navigator, "mediaDevices", { value: mediaDevices, configurable: true });
    const onChange = vi.fn();
    watchOutputDevices(onChange);
    target.dispatchEvent(new Event("devicechange"));
    expect(onChange).not.toHaveBeenCalled();
    target.dispatchEvent(new Event("devicechange"));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
