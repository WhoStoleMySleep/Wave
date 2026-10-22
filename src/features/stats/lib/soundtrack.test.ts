import { describe, it, expect } from "vitest";
import type { ArtistStat, ListeningStats, TrackStat } from "@/shared/api";
import type { RecapSlide } from "./recap";
import { cueTracks, recapSoundtrack, soundtrackTrackIds, type RecapCue } from "./soundtrack";

function track(id: string, artistId: string): TrackStat {
  return { track: { id, title: id, artists: [{ id: artistId, name: artistId }], durationMs: 180_000 }, plays: 5, minutes: 15 };
}

function artist(id: string): ArtistStat {
  return { artist: { id, name: id }, plays: 5, minutes: 15 };
}

const TRACKS = [track("t1", "B"), track("t2", "A"), track("t3", "C"), track("t4", "D"), track("t5", "E")];

function stats(overrides: Partial<ListeningStats> = {}): ListeningStats {
  return {
    minutesListened: 100,
    playCount: 30,
    skipCount: 0,
    trackCount: 5,
    artistCount: 5,
    newArtistCount: 0,
    longestStreakDays: 1,
    topTracks: TRACKS,
    topArtists: [artist("A"), artist("B")],
    days: [],
    hours: Array<number>(24).fill(0),
    ...overrides,
  };
}

/** The track ids a cue plays, "-" for silence, samples joined with "+". */
function heard(cues: (RecapCue | null)[]): string[] {
  return cues.map((cue) => cueTracks(cue).map(({ id }) => id).join("+") || "-");
}

describe("recapSoundtrack", () => {
  it("changes the music only on slides about a track or an artist", () => {
    const data = stats();
    const slides: RecapSlide[] = [
      { kind: "intro" },
      { kind: "minutes", minutes: 100, activeDays: 3, perActiveDay: 33 },
      { kind: "topArtist", stat: data.topArtists[0] },
      { kind: "topTrack", stat: TRACKS[0] },
      { kind: "topTracks", stats: TRACKS.slice(0, 3), total: 5 },
      { kind: "streak", days: 4 },
      { kind: "clock", hours: data.hours, peakHour: 0, daypart: "night" },
      { kind: "topDay", day: { date: "2026-10-01", minutes: 40 } },
      { kind: "outro", stats: data },
    ];
    expect(heard(recapSoundtrack(slides, data))).toEqual(["t2", "t2", "t2", "t1", "t1+t2+t3", "t3", "t4", "t4", "t1"]);
  });

  it("keeps a track playing when the next slide asks for the same one", () => {
    const data = stats({ topArtists: [artist("B")] });
    const cues = recapSoundtrack([{ kind: "intro" }, { kind: "topTrack", stat: TRACKS[0] }], data);
    expect(cues[1]).toBe(cues[0]);
  });

  it("lists every track of the recap once, in playing order", () => {
    const cues: RecapCue[] = [
      { kind: "track", track: TRACKS[1].track },
      { kind: "samples", tracks: [TRACKS[0].track, TRACKS[1].track, TRACKS[2].track] },
      { kind: "track", track: TRACKS[0].track },
    ];
    expect(soundtrackTrackIds([...cues, null])).toEqual(["t2", "t1", "t3"]);
  });

  it("stays silent without top tracks", () => {
    const data = stats({ topTracks: [], topArtists: [] });
    expect(heard(recapSoundtrack([{ kind: "intro" }, { kind: "outro", stats: data }], data))).toEqual(["-", "-"]);
  });

  it("leaves a discovery without a top track to the music before it", () => {
    const data = stats();
    const cues = recapSoundtrack([{ kind: "intro" }, { kind: "discovery", count: 2, stat: artist("Z") }], data);
    expect(heard(cues)).toEqual(["t2", "t2"]);
  });
});
