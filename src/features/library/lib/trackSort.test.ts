import { beforeEach, describe, expect, it } from "vitest";
import type { Track } from "@/shared/types";
import { readTrackOrder, sortTracks, writeTrackOrder } from "./trackSort";

const track = (id: string, addedAt: string): Track => ({ id, title: id, addedAt }) as Track;

describe("sortTracks", () => {
  const tracks = [track("a", "2026-01-01"), track("b", "2026-03-01"), track("c", "2026-03-01")];

  it("puts the newest first and keeps playlist order on ties", () => {
    expect(sortTracks(tracks, { sort: "added", reversed: false }).map((t) => t.id)).toEqual(["b", "c", "a"]);
  });

  it("flips the whole list, ties included, when reversed", () => {
    expect(sortTracks(tracks, { sort: "added", reversed: true }).map((t) => t.id)).toEqual(["a", "c", "b"]);
    expect(sortTracks(tracks, { sort: "custom", reversed: true }).map((t) => t.id)).toEqual(["c", "b", "a"]);
  });
});

describe("readTrackOrder", () => {
  beforeEach(() => localStorage.clear());

  it("reads a sort saved by older builds", () => {
    localStorage.setItem("wave:playlist-sort", JSON.stringify({ p: "added" }));
    expect(readTrackOrder("p")).toEqual({ sort: "added", reversed: false });
  });

  it("remembers the direction", () => {
    writeTrackOrder("p", { sort: "title", reversed: true });
    expect(readTrackOrder("p")).toEqual({ sort: "title", reversed: true });
  });
});
