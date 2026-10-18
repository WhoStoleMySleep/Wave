import { describe, it, expect } from "vitest";
import type { ListeningHistoryItem, PopularTrack } from "@/shared/api";
import { getDailyMixArtists, toDailyMix, toPopularArtists, toRecentItems } from "./homeFeed";
import type { Track } from "@/shared/types";

describe("getDailyMixArtists", () => {
  it("extracts 3-4 artists from cluster artists and tracks", () => {
    const clusterArtists = ["Rae Sremmurd"];
    const tracks: Track[] = [
      {
        id: "1",
        title: "No Type",
        artists: "Rae Sremmurd",
        coverUrl: "",
        durationMs: 200000,
        playCount: 10,
      },
      {
        id: "2",
        title: "For The Night",
        artists: "Pop Smoke, Lil Baby, DaBaby",
        artistList: [
          { id: "a1", name: "Pop Smoke" },
          { id: "a2", name: "Lil Baby" },
          { id: "a3", name: "DaBaby" },
        ],
        coverUrl: "",
        durationMs: 190000,
        playCount: 5,
      },
      {
        id: "3",
        title: "Hope",
        artists: "XXXTENTACION",
        coverUrl: "",
        durationMs: 110000,
        playCount: 20,
      },
    ];

    const result = getDailyMixArtists(clusterArtists, tracks, 4);
    expect(result).toEqual(["Rae Sremmurd", "Pop Smoke", "Lil Baby", "DaBaby"]);
  });

  it("deduplicates case-insensitively and handles missing cluster artists", () => {
    const tracks: Track[] = [
      {
        id: "1",
        title: "Track 1",
        artists: "Drake",
        coverUrl: "",
        durationMs: 200000,
        playCount: 10,
      },
      {
        id: "2",
        title: "Track 2",
        artists: "drake, 21 Savage",
        coverUrl: "",
        durationMs: 200000,
        playCount: 10,
      },
    ];

    const result = getDailyMixArtists([], tracks, 4);
    expect(result).toEqual(["Drake", "21 Savage"]);
  });
});

function catalogTrack(id: string, artists = "Artist", album?: { id: string; title: string }) {
  return { id, title: `Title ${id}`, artists, coverUrl: `cover-${id}`, durationMs: 1000, album } as unknown as PopularTrack["track"];
}

function play(track: PopularTrack["track"], context?: { type: string; id: string }): ListeningHistoryItem {
  return { id: `play-${track.id}`, track, context } as unknown as ListeningHistoryItem;
}

describe("getDailyMixArtists edge cases", () => {
  it("skips placeholder names and stops at the requested count", () => {
    expect(getDailyMixArtists(["Unknown", " A ", "B", "C"], [], 2)).toEqual(["A", "B"]);
  });
});

describe("toRecentItems", () => {
  it("shows a track played again later only once, at its newest play", () => {
    const items = toRecentItems([play(catalogTrack("1")), play(catalogTrack("2")), play(catalogTrack("1"))], 10);
    expect(items.map((item) => item.item.id)).toEqual(["1", "2"]);
  });

  it("hides a standalone play of a track already shown inside its album", () => {
    const album = { id: "al", title: "Album" };
    const items = toRecentItems([play(catalogTrack("1", "A", album), { type: "album", id: "al" }), play(catalogTrack("1", "A", album))], 10);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: "album", item: { id: "al", title: "Album" } });
  });

  it("stops at the limit", () => {
    const items = toRecentItems([play(catalogTrack("1")), play(catalogTrack("2")), play(catalogTrack("3"))], 2);
    expect(items).toHaveLength(2);
  });
});

describe("toPopularArtists", () => {
  it("lists each lead artist once, at their best-ranked track", () => {
    const entry = (id: string, artists: string, playCount: number) => ({ track: catalogTrack(id, artists), playCount }) as PopularTrack;
    const items = toPopularArtists([entry("1", "A, B", 9), entry("2", "C", 5), entry("3", "A", 1)]);
    expect(items.map((item) => [item.item.id, item.playCount])).toEqual([
      ["A", 9],
      ["C", 5],
    ]);
  });
});

describe("toDailyMix", () => {
  it("takes the cover of the second track when the first has none and counts the tracks when the server does not", () => {
    const mix = toDailyMix({ id: "m", title: "Mix", description: "", clusterArtists: [], trackCount: 0, tracks: [{ ...catalogTrack("1"), coverUrl: "" }, catalogTrack("2")] } as never);
    expect(mix.coverUrl).toBe("cover-2");
    expect(mix.trackCount).toBe(2);
  });
});
