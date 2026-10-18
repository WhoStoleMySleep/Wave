import { describe, expect, it, vi } from "vitest";
import type { AlbumDetails, CatalogPlaylistDetails, PlaylistContents } from "@/shared/api";
import { albumPage, dailyMixPage, isDailyMixId, isPlaylistContents, userPlaylistPage } from "./collectionPage";

vi.mock("@/shared/api", () => ({
  mediaUrl: (path: string) => (path ? `https://media.test${path}` : ""),
  toClientTrack: (track: { id: string; coverUrl?: string; album?: { id: string; title: string } }) => ({
    id: track.id,
    title: track.id,
    artists: "",
    coverUrl: track.coverUrl ?? "",
    durationMs: 0,
    playCount: 0,
    album: track.album,
  }),
}));

describe("isDailyMixId", () => {
  it("recognizes mix ids, encoded or not", () => {
    expect(isDailyMixId(["daily-mix-1"])).toBe(true);
    expect(isDailyMixId(["x", "mix-2"])).toBe(true);
    expect(isDailyMixId(["album-1"])).toBe(false);
  });
});

describe("isPlaylistContents", () => {
  it("tells a user playlist from a catalog one", () => {
    expect(isPlaylistContents({ playlist: {}, items: [] } as unknown as PlaylistContents)).toBe(true);
    expect(isPlaylistContents({ type: "playlist", tracks: [] } as unknown as CatalogPlaylistDetails)).toBe(false);
  });
});

describe("dailyMixPage", () => {
  it("names the mix by its artists and marks it", () => {
    const page = dailyMixPage({ id: "m", title: "Mix", description: "", clusterArtists: [], trackCount: 0, tracks: [] });
    expect(page).toMatchObject({ author: "Daily Mix", coverUrl: "", isDailyMix: true });
    expect(dailyMixPage({ id: "m", title: "Mix", description: "", clusterArtists: ["A", "B"], trackCount: 0, tracks: [] }).author).toBe("A, B");
  });
});

describe("userPlaylistPage", () => {
  it("uses the owner's display name, then the username", () => {
    const contents = {
      playlist: { title: "Mine", description: "", owner: { displayName: null, username: "kos" } },
      items: [{ track: { id: "t1", cover: { url: "/c" } } }],
    } as unknown as PlaylistContents;
    expect(userPlaylistPage(contents)).toMatchObject({ author: "kos", description: undefined, coverUrl: "https://media.test/c" });
  });
});

describe("albumPage", () => {
  const album = {
    type: "album",
    title: "Record",
    artists: [{ id: "a", name: "Artist" }],
    year: 2020,
    cover: { url: "/album" },
    tracks: [
      { id: "plain" },
      { id: "video", coverUrl: "https://i.ytimg.com/vi/x.jpg" },
      { id: "own", coverUrl: "https://own.test/c.jpg", album: { id: "other", title: "Other" } },
    ],
  } as unknown as AlbumDetails;

  it("fills in the album and replaces missing or video covers", () => {
    const [plain, video, own] = albumPage(album, "alb-1").tracks;
    expect(plain).toMatchObject({ album: { id: "alb-1", title: "Record" }, coverUrl: "https://media.test/album" });
    expect(video.coverUrl).toBe("https://media.test/album");
    expect(own).toMatchObject({ album: { id: "other" }, coverUrl: "https://own.test/c.jpg" });
  });

  it("keeps the album details", () => {
    expect(albumPage(album, "alb-1")).toMatchObject({ type: "album", year: 2020, artists: [{ id: "a", name: "Artist" }] });
  });
});
