import type { CatalogTrack, ListeningStats } from "@/shared/api";
import type { RecapSlide } from "./recap";

/** What plays under a slide: one track, or a few seconds of each listed track in turn. */
export type RecapCue = { kind: "track"; track: CatalogTrack } | { kind: "samples"; tracks: CatalogTrack[] };

/** How long each track of a list slide plays before the next; the list goes round while the slide is open. */
export const SAMPLE_MS = 8000;
/** Where a track starts: by then most songs are past the intro. */
export const START_FRACTION = 0.35;

type SlidePick = CatalogTrack | CatalogTrack[] | undefined;

function bestTrackOf(stats: ListeningStats, artistId: string | undefined): CatalogTrack | undefined {
  if (!artistId) return undefined;
  return stats.topTracks.find(({ track }) => track.artists.some((artist) => artist.id === artistId))?.track;
}

function freshTrack(stats: ListeningStats, used: Set<string>): CatalogTrack | undefined {
  return stats.topTracks.find(({ track }) => !used.has(track.id))?.track;
}

/** The slides that are about a track or an artist bring their own music; the rest leave it playing. */
function slidePick(slide: RecapSlide, stats: ListeningStats, used: Set<string>): SlidePick {
  const top = stats.topTracks[0]?.track;
  switch (slide.kind) {
    case "intro":
      return bestTrackOf(stats, stats.topArtists[0]?.artist.id) ?? top;
    case "topArtist":
      return bestTrackOf(stats, slide.stat.artist.id);
    case "topTrack":
      return slide.stat.track;
    case "topTracks":
      return slide.stats.map(({ track }) => track);
    case "onRepeat":
      return slide.repeat.track;
    case "clock":
      return freshTrack(stats, used);
    case "discovery":
      return bestTrackOf(stats, slide.stat?.artist.id);
    case "outro":
      return top;
    default:
      return undefined;
  }
}

function lastTrack(cue: RecapCue | null): CatalogTrack | undefined {
  if (!cue) return undefined;
  return cue.kind === "track" ? cue.track : cue.tracks.at(-1);
}

/**
 * The music of each slide. The music changes only where a slide is about
 * something you can hear, so most tracks play across a few slides; a slide
 * that asks for what is already playing keeps it going.
 */
export function recapSoundtrack(slides: RecapSlide[], stats: ListeningStats): (RecapCue | null)[] {
  const used = new Set<string>();
  let current: RecapCue | null = null;
  return slides.map((slide) => {
    const pick = slidePick(slide, stats, used);
    const playing = lastTrack(current);
    if (Array.isArray(pick) && pick.length > 0) {
      current = { kind: "samples", tracks: pick };
    } else if (pick && !Array.isArray(pick) && pick.id !== playing?.id) {
      current = { kind: "track", track: pick };
    } else if (current?.kind === "samples") {
      current = playing ? { kind: "track", track: playing } : null;
    }
    if (current?.kind === "track") used.add(current.track.id);
    if (current?.kind === "samples") current.tracks.forEach((track) => used.add(track.id));
    return current;
  });
}

/** The tracks a cue plays, to get them ready ahead of the slide. */
export function cueTracks(cue: RecapCue | null | undefined): CatalogTrack[] {
  if (!cue) return [];
  return cue.kind === "track" ? [cue.track] : cue.tracks;
}
