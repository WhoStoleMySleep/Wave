import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaylistContents, UserPlaylistItem } from "@/shared/api";
import { extractCovers, readCoverCache, rememberCovers, toDetail } from "./playlistDetail";

vi.mock("@/shared/api", () => ({
  mediaUrl: (path: string) => (path ? `https://media.test${path}` : ""),
  toClientTrack: (track: { id: string; title: string }) => ({ id: track.id, title: track.title }),
}));

function item(id: string, cover?: string): UserPlaylistItem {
  return {
    id: `item-${id}`,
    position: 0,
    addedAt: "2026-01-01",
    track: { id, title: id, cover: cover === undefined ? undefined : { url: cover } },
  } as unknown as UserPlaylistItem;
}

describe("extractCovers", () => {
  it("keeps the first four distinct covers", () => {
    const items = [item("1", "/a"), item("2", "/a"), item("3"), item("4", ""), item("5", "/b"), item("6", "/c"), item("7", "/d"), item("8", "/e")];
    expect(extractCovers(items)).toEqual(["/a", "/b", "/c", "/d"].map((path) => `https://media.test${path}`));
  });

  it("is empty for a playlist without covers", () => {
    expect(extractCovers([item("1")])).toEqual([]);
  });
});

describe("toDetail", () => {
  it("maps the playlist with its tracks", () => {
    const response = {
      playlist: { id: "p1", title: "Mix", description: "d", revision: 3 },
      items: [item("t1", "/a")],
    } as unknown as PlaylistContents;
    expect(toDetail(response)).toEqual({
      id: "p1",
      title: "Mix",
      description: "d",
      trackCount: 1,
      coverUrl: "https://media.test/a",
      coverUrls: ["https://media.test/a"],
      revision: 3,
      tracks: [{ id: "t1", title: "t1", playlistItemId: "item-t1", addedAt: "2026-01-01" }],
    });
  });
});

describe("cover cache", () => {
  beforeEach(() => localStorage.clear());

  it("adds a playlist's covers to the saved ones", () => {
    rememberCovers("p1", { coverUrls: ["a"], trackCount: 1, updatedAt: "u1" });
    rememberCovers("p2", { coverUrls: [], trackCount: 0, updatedAt: "u2" });
    expect(Object.keys(readCoverCache())).toEqual(["p1", "p2"]);
  });

  it("starts over when the saved cache is broken", () => {
    localStorage.setItem("wave:playlist-covers-v2", "{broken");
    expect(readCoverCache()).toEqual({});
  });
});
