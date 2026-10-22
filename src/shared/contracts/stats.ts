import type { ArtistRef, CatalogTrack, Cover } from "./catalog";

/** Monday to Sunday, as local dates `YYYY-MM-DD`. */
export interface StatsWeek {
  start: string;
  end: string;
}

export interface TrackStat {
  track: CatalogTrack;
  plays: number;
  minutes: number;
}

export interface ArtistStat {
  artist: ArtistRef;
  plays: number;
  minutes: number;
}

export interface DayStat {
  date: string;
  minutes: number;
}

/**
 * Listening over a period. Skipped plays add to the minutes but not to the
 * play counts, the tops or the streak.
 */
export interface ListeningStats {
  minutesListened: number;
  playCount: number;
  skipCount: number;
  trackCount: number;
  artistCount: number;
  /** Artists never played before the period. */
  newArtistCount: number;
  longestStreakDays: number;
  topTracks: TrackStat[];
  topArtists: ArtistStat[];
  /** Days with any listening, oldest first. */
  days: DayStat[];
  /** Minutes by local hour of day, 24 entries. */
  hours: number[];
  /** The track played the most times within one week. */
  onRepeat?: TrackStat & { week: StatsWeek };
  /** Two artists of one week that share no track and rarely meet. */
  combo?: { artists: [ArtistRef, ArtistRef]; week: StatsWeek };
  /** The most played of the new artists. */
  discovery?: ArtistStat;
}

export interface ArtistCover {
  id: string;
  cover?: Cover;
}
