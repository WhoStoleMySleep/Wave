import { describe, it, expect } from "vitest";
import type { ArtistStat, ListeningStats, TrackStat } from "@/shared/api";
import { buildRecapSlides, daypartOf, peakHour, recapArtistIds, topDay } from "./recap";

function artist(name: string, plays: number): ArtistStat {
  return { artist: { id: `UC${name}`, name }, plays, minutes: plays * 3 };
}

function track(id: string, plays: number): TrackStat {
  return { track: { id, title: id, artists: [], durationMs: 180_000 }, plays, minutes: plays * 3 };
}

function stats(overrides: Partial<ListeningStats> = {}): ListeningStats {
  const hours = Array<number>(24).fill(0);
  hours[23] = 30;
  return {
    minutesListened: 30,
    playCount: 10,
    skipCount: 0,
    trackCount: 1,
    artistCount: 1,
    newArtistCount: 0,
    longestStreakDays: 1,
    topTracks: [track("a", 10)],
    topArtists: [artist("A", 10)],
    days: [{ date: "2026-10-05", minutes: 30 }],
    hours,
    ...overrides,
  };
}

describe("buildRecapSlides", () => {
  it("tells nothing without plays", () => {
    expect(buildRecapSlides(stats({ playCount: 0, topTracks: [], topArtists: [] }))).toEqual([]);
  });

  it("leaves out short lists and empty stories", () => {
    const kinds = buildRecapSlides(stats()).map((slide) => slide.kind);
    expect(kinds).toEqual(["intro", "minutes", "topArtist", "topTrack", "clock", "topDay", "outro"]);
  });

  it("tells every story a rich period has", () => {
    const week = { start: "2026-10-12", end: "2026-10-18" };
    const kinds = buildRecapSlides(
      stats({
        topArtists: [artist("A", 9), artist("B", 5), artist("C", 2)],
        topTracks: [track("a", 9), track("b", 5), track("c", 2)],
        onRepeat: { ...track("a", 6), week },
        longestStreakDays: 4,
        newArtistCount: 2,
        discovery: artist("C", 2),
        combo: { artists: [{ id: "UCA", name: "A" }, { id: "UCC", name: "C" }], week },
      }),
    ).map((slide) => slide.kind);
    expect(kinds).toEqual([
      "intro", "minutes", "topArtist", "topArtists", "topTrack", "topTracks", "onRepeat",
      "clock", "topDay", "streak", "discovery", "combo", "outro",
    ]);
  });

  it("averages minutes over the days with listening", () => {
    const [, minutes] = buildRecapSlides(
      stats({ minutesListened: 100, days: [{ date: "2026-10-01", minutes: 70 }, { date: "2026-10-09", minutes: 30 }] }),
    );
    expect(minutes).toEqual({ kind: "minutes", minutes: 100, activeDays: 2, perActiveDay: 50 });
  });
});

describe("clock helpers", () => {
  it("finds the busiest hour and names its part of the day", () => {
    const hours = Array<number>(24).fill(0);
    hours[8] = 5;
    hours[23] = 9;
    expect(peakHour(hours)).toBe(23);
    expect(daypartOf(23)).toBe("night");
    expect(daypartOf(4)).toBe("night");
    expect(daypartOf(5)).toBe("morning");
    expect(daypartOf(12)).toBe("day");
    expect(daypartOf(17)).toBe("evening");
  });

  it("keeps the earlier of two equally busy days", () => {
    expect(topDay([{ date: "2026-10-01", minutes: 5 }, { date: "2026-10-02", minutes: 5 }])?.date).toBe("2026-10-01");
    expect(topDay([])).toBeUndefined();
  });
});

describe("recapArtistIds", () => {
  it("takes the top five, the discovery and the combo, skipping artists without a channel", () => {
    const ids = recapArtistIds(
      stats({
        topArtists: ["A", "B", "C", "D", "E", "F"].map((name) => artist(name, 1)),
        discovery: artist("G", 1),
        combo: { artists: [{ id: "UCH", name: "H" }, { id: "", name: "I" }], week: { start: "", end: "" } },
      }),
    );
    expect(ids).toEqual(["UCA", "UCB", "UCC", "UCD", "UCE", "UCG", "UCH"]);
  });
});
