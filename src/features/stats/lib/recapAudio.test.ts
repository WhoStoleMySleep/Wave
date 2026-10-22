import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogTrack, PlaybackSession } from "@/shared/api";

const createPlaybackSession = vi.fn<(trackId: string) => Promise<PlaybackSession>>();

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api")>();
  return { ...actual, api: { ...actual.api, createPlaybackSession: (trackId: string) => createPlaybackSession(trackId) } };
});

vi.mock("@/features/player", () => ({
  usePlayerStore: { getState: () => ({ volume: 0.5, normalizeVolume: false }) },
}));

const { RecapAudio } = await import("./recapAudio");

function track(id: string): CatalogTrack {
  return { id, title: id, artists: [], durationMs: 200_000 };
}

function session(trackId: string): PlaybackSession {
  return {
    sessionId: trackId,
    playbackId: trackId,
    trackId,
    streamUrl: `https://example.com/${trackId}.webm`,
    codec: "opus",
    bitrate: 160_000,
    mimeType: "audio/webm",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    transport: "proxy",
  };
}

describe("RecapAudio", () => {
  let played: string[];

  beforeEach(() => {
    played = [];
    createPlaybackSession.mockImplementation(async (trackId) => session(trackId));
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
      played.push(this.src);
      return Promise.resolve();
    });
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    createPlaybackSession.mockReset();
  });

  it("plays a track from its stream", async () => {
    const audio = new RecapAudio();
    await audio.play(track("a"));
    expect(played).toEqual(["https://example.com/a.webm"]);
  });

  it("leaves a track playing when asked for it again", async () => {
    const audio = new RecapAudio();
    await audio.play(track("a"));
    await audio.play(track("a"));
    expect(played).toHaveLength(1);
    expect(createPlaybackSession).toHaveBeenCalledTimes(1);
  });

  it("drops a track whose stream came after a newer one was asked for", async () => {
    let release = () => {};
    createPlaybackSession.mockImplementationOnce(
      (trackId) => new Promise((resolve) => (release = () => resolve(session(trackId)))),
    );
    const audio = new RecapAudio();
    const slow = audio.play(track("slow"));
    await audio.play(track("b"));
    release();
    await slow;
    expect(played).toEqual(["https://example.com/b.webm"]);
  });

  it("keeps the track before playing when the next one will not start", async () => {
    const audio = new RecapAudio();
    await audio.play(track("a"));
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error("blocked"));
    await audio.play(track("b"));
    await audio.play(track("a"));
    expect(played).toEqual(["https://example.com/a.webm"]);
  });

  it("keeps the track before playing when the next one has no stream", async () => {
    const audio = new RecapAudio();
    await audio.play(track("a"));
    createPlaybackSession.mockRejectedValueOnce(new Error("unavailable"));
    await audio.play(track("b"));
    await audio.play(track("a"));
    expect(played).toEqual(["https://example.com/a.webm"]);
  });

  it("lets a track that starts after the recap closed stay silent", async () => {
    let start = () => {};
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(() => new Promise((resolve) => (start = () => resolve())));
    const audio = new RecapAudio();
    const playing = audio.play(track("a"));
    await vi.waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalled());
    const element = vi.mocked(HTMLMediaElement.prototype.play).mock.contexts[0] as HTMLMediaElement;
    audio.stop();
    start();
    await playing;
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(element.volume).toBe(0);
  });

  it("reuses a prefetched stream", async () => {
    const audio = new RecapAudio();
    audio.prefetch(["a"]);
    await audio.play(track("a"));
    expect(createPlaybackSession).toHaveBeenCalledTimes(1);
  });

  it("plays a buffered track without asking for its stream again", async () => {
    const audio = new RecapAudio();
    audio.prepare([track("a"), track("b")]);
    await vi.waitFor(() => expect(createPlaybackSession).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await audio.play(track("b"));
    expect(played).toEqual(["https://example.com/b.webm"]);
    expect(createPlaybackSession).toHaveBeenCalledTimes(2);
  });

  it("lets go of buffers no longer near", async () => {
    const release = vi.spyOn(HTMLMediaElement.prototype, "removeAttribute");
    const audio = new RecapAudio();
    audio.prepare([track("a")]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    audio.prepare([track("b")]);
    expect(release).toHaveBeenCalledWith("src");
  });

  it("waits with the music while paused", async () => {
    const audio = new RecapAudio();
    audio.setPaused(true);
    await audio.play(track("a"));
    expect(played).toEqual([]);
    audio.setPaused(false);
    expect(played).toEqual(["https://example.com/a.webm"]);
  });
});
