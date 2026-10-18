import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioDeck } from "./audioDeck";
import { FADE_FLOOR } from "./audioFades";
import type { MediaHandlers } from "./mediaEvents";

function handlers(): MediaHandlers {
  return { timeupdate: vi.fn(), durationchange: vi.fn(), waiting: vi.fn(), ended: vi.fn(), playing: vi.fn(), pause: vi.fn(), error: vi.fn() };
}

describe("AudioDeck", () => {
  let routes: MediaHandlers;
  let deck: AudioDeck;

  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:track");
    routes = handlers();
    deck = new AudioDeck(routes);
  });

  afterEach(() => vi.restoreAllMocks());

  it("routes the events of its element", () => {
    deck.audio.dispatchEvent(new Event("waiting"));
    expect(routes.waiting).toHaveBeenCalledWith(deck.audio);
  });

  it("revokes the blob it holds on reset", () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    expect(deck.holdBlob(new Blob())).toBe("blob:track");
    expect(deck.isPlayingBlob).toBe(true);
    deck.reset();
    expect(revoke).toHaveBeenCalledWith("blob:track");
    expect(deck.isPlayingBlob).toBe(false);
  });

  it("keeps teardown events of a reset away from the handlers", () => {
    deck.audio.src = "https://example.com/a.webm";
    const emitOnRelease = vi.spyOn(deck.audio, "removeAttribute").mockImplementation(() => deck.audio.dispatchEvent(new Event("pause")));
    deck.reset();
    expect(emitOnRelease).toHaveBeenCalled();
    expect(routes.pause).not.toHaveBeenCalled();
  });

  it("has no playable source once the stream session expired", () => {
    deck.audio.src = "https://example.com/a.webm";
    deck.setSessionExpiry(Date.now() + 60_000);
    expect(deck.hasPlayableSource()).toBe(true);
    deck.setSessionExpiry(Date.now());
    expect(deck.hasPlayableSource()).toBe(false);
  });

  it("hands off to a fresh near-silent element and stops hearing the old one", () => {
    const old = deck.audio;
    deck.handOff();
    expect(deck.audio).not.toBe(old);
    expect(deck.audio.volume).toBe(FADE_FLOOR);
    old.dispatchEvent(new Event("waiting"));
    expect(routes.waiting).not.toHaveBeenCalled();
    deck.dropRetired();
  });
});
