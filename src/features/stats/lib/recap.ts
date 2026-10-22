import type { ArtistStat, DayStat, ListeningStats, TrackStat } from "@/shared/api";

export type Daypart = "morning" | "day" | "evening" | "night";

type Repeat = NonNullable<ListeningStats["onRepeat"]>;
type Combo = NonNullable<ListeningStats["combo"]>;

export type RecapSlide =
  | { kind: "intro" }
  | { kind: "minutes"; minutes: number; activeDays: number; perActiveDay: number }
  | { kind: "topArtist"; stat: ArtistStat }
  | { kind: "topArtists"; stats: ArtistStat[]; total: number }
  | { kind: "topTrack"; stat: TrackStat }
  | { kind: "topTracks"; stats: TrackStat[]; total: number }
  | { kind: "onRepeat"; repeat: Repeat }
  | { kind: "clock"; hours: number[]; peakHour: number; daypart: Daypart }
  | { kind: "topDay"; day: DayStat }
  | { kind: "streak"; days: number }
  | { kind: "discovery"; count: number; stat?: ArtistStat }
  | { kind: "combo"; combo: Combo }
  | { kind: "outro"; stats: ListeningStats };

export const TOP_LIST_SIZE = 5;
/** A list slide with fewer entries repeats the slide before it. */
const MIN_LIST_SIZE = 3;

export function peakHour(hours: number[]): number {
  return hours.reduce((best, minutes, hour) => (minutes > hours[best] ? hour : best), 0);
}

export function daypartOf(hour: number): Daypart {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "day";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

/** The busiest day; the earlier one wins a tie. */
export function topDay(days: DayStat[]): DayStat | undefined {
  return days.reduce<DayStat | undefined>((best, day) => (!best || day.minutes > best.minutes ? day : best), undefined);
}

/** Artists whose photos the recap shows: the top ones, the discovery and the combo. */
export function recapArtistIds(stats: ListeningStats): string[] {
  const artists = [...stats.topArtists.slice(0, TOP_LIST_SIZE).map(({ artist }) => artist), stats.discovery?.artist, ...(stats.combo?.artists ?? [])];
  return artists.map((artist) => artist?.id ?? "").filter(Boolean);
}

/**
 * The story of a period, one slide per thing worth telling: a slide whose
 * numbers would be empty or trivial is left out. No plays means no story.
 */
export function buildRecapSlides(stats: ListeningStats): RecapSlide[] {
  if (stats.playCount === 0) return [];
  const [topArtist] = stats.topArtists;
  const [topTrack] = stats.topTracks;
  const busiest = topDay(stats.days);
  const peak = peakHour(stats.hours);
  const activeDays = stats.days.length;
  const slides: (RecapSlide | false | undefined)[] = [
    { kind: "intro" },
    { kind: "minutes", minutes: stats.minutesListened, activeDays, perActiveDay: Math.round(stats.minutesListened / Math.max(activeDays, 1)) },
    topArtist && { kind: "topArtist", stat: topArtist },
    stats.topArtists.length >= MIN_LIST_SIZE && { kind: "topArtists", stats: stats.topArtists.slice(0, TOP_LIST_SIZE), total: stats.artistCount },
    topTrack && { kind: "topTrack", stat: topTrack },
    stats.topTracks.length >= MIN_LIST_SIZE && { kind: "topTracks", stats: stats.topTracks.slice(0, TOP_LIST_SIZE), total: stats.trackCount },
    stats.onRepeat && { kind: "onRepeat", repeat: stats.onRepeat },
    { kind: "clock", hours: stats.hours, peakHour: peak, daypart: daypartOf(peak) },
    busiest && { kind: "topDay", day: busiest },
    stats.longestStreakDays >= 2 && { kind: "streak", days: stats.longestStreakDays },
    stats.newArtistCount > 0 && { kind: "discovery", count: stats.newArtistCount, stat: stats.discovery },
    stats.combo && { kind: "combo", combo: stats.combo },
    { kind: "outro", stats },
  ];
  return slides.filter((slide): slide is RecapSlide => Boolean(slide));
}
