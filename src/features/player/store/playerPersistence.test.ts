import { describe, expect, it } from "vitest";
import type { Track } from "@/shared/types";
import { DEFAULT_VOLUME, INITIAL_PLAYER_STATE } from "./playerDefaults";
import { mergePlayerSession, migratePlayerSession, persistedPlayerSession } from "./playerPersistence";
import { usePlayerStore } from "./playerStore";
import type { PlayerStore } from "./playerTypes";

const track = { id: "t1", title: "Song" } as Track;

function currentStore(): PlayerStore {
  return usePlayerStore.getState();
}

describe("persistedPlayerSession", () => {
  it("saves the queue and position when the user resumes sessions", () => {
    const session = persistedPlayerSession({ ...INITIAL_PLAYER_STATE, currentTrack: track, positionMs: 42_000 });
    expect(session.currentTrack).toBe(track);
    expect(session.positionMs).toBe(42_000);
    expect(session.volume).toBe(DEFAULT_VOLUME);
  });

  it("saves only preferences when sessions start empty", () => {
    const session = persistedPlayerSession({ ...INITIAL_PLAYER_STATE, currentTrack: track, defaultPlaybackContext: "empty" });
    expect(session).not.toHaveProperty("currentTrack");
    expect(session).not.toHaveProperty("queue");
    expect(session.defaultPlaybackContext).toBe("empty");
  });

  it("never saves transient state", () => {
    const session = persistedPlayerSession({ ...INITIAL_PLAYER_STATE, status: "playing", error: "x", fullscreen: true });
    expect(session).not.toHaveProperty("status");
    expect(session).not.toHaveProperty("error");
    expect(session).not.toHaveProperty("fullscreen");
  });
});

describe("migratePlayerSession", () => {
  it("moves the old full-volume default to the new default", () => {
    expect(migratePlayerSession({ volume: 1 }, 0).volume).toBe(DEFAULT_VOLUME);
  });

  it("keeps a volume the user chose", () => {
    expect(migratePlayerSession({ volume: 0.3 }, 0).volume).toBe(0.3);
  });

  it("leaves current sessions alone", () => {
    expect(migratePlayerSession({ volume: 1 }, 1).volume).toBe(1);
  });

  it("tolerates a missing session", () => {
    expect(migratePlayerSession(undefined, 0)).toEqual({});
  });
});

describe("mergePlayerSession", () => {
  it("restores a saved track as paused", () => {
    expect(mergePlayerSession({ currentTrack: track }, currentStore()).status).toBe("paused");
  });

  it("stays idle without a saved track", () => {
    expect(mergePlayerSession({ volume: 0.5 }, currentStore()).status).toBe("idle");
  });

  it("falls back to the default accent when the saved one was removed", () => {
    expect(mergePlayerSession({ accentVariant: "neon" }, currentStore()).accentVariant).toBe("default");
  });

  it("keeps the store actions", () => {
    const merged = mergePlayerSession({ volume: 0.5 }, currentStore());
    expect(merged.setVolume).toBe(currentStore().setVolume);
    expect(merged.volume).toBe(0.5);
  });
});
