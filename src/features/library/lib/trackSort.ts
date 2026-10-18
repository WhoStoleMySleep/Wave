import type { Track } from "@/shared/types";

export type TrackSort = "custom" | "title" | "artist" | "added" | "duration";

export const TRACK_SORTS: TrackSort[] = ["custom", "title", "artist", "added", "duration"];

export interface TrackOrder {
  sort: TrackSort;
  reversed: boolean;
}

export const DEFAULT_TRACK_ORDER: TrackOrder = { sort: "custom", reversed: false };

const STORAGE_KEY = "wave:playlist-sort";

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/** Older builds stored a bare sort name, so both shapes are accepted. */
type StoredOrder = TrackSort | TrackOrder;

function readAll(): Record<string, StoredOrder> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

/** Each playlist remembers its own sort, as in Spotify. */
export function readTrackOrder(playlistKey: string): TrackOrder {
  const value = readAll()[playlistKey];
  const order = typeof value === "string" ? { sort: value, reversed: false } : value;
  return order && TRACK_SORTS.includes(order.sort)
    ? { sort: order.sort, reversed: order.reversed === true }
    : DEFAULT_TRACK_ORDER;
}

export function writeTrackOrder(playlistKey: string, order: TrackOrder): void {
  const all = readAll();
  if (order.sort === "custom" && !order.reversed) delete all[playlistKey];
  else all[playlistKey] = order;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {}
}

/**
 * Sorted copy of the list. Ties keep the playlist order, so equal titles or
 * durations never trade places between renders. A reversed order flips the
 * whole list, ties included: imported tracks share one `addedAt`, and
 * "oldest first" has to flip their playlist order too.
 */
export function sortTracks(tracks: Track[], { sort, reversed }: TrackOrder): Track[] {
  if (sort === "custom") return reversed ? [...tracks].reverse() : tracks;
  const compare = (a: Track, b: Track): number => {
    switch (sort) {
      case "title":
        return collator.compare(a.title, b.title);
      case "artist":
        return collator.compare(a.artists, b.artists) || collator.compare(a.title, b.title);
      case "added":
        return (b.addedAt ?? "").localeCompare(a.addedAt ?? "");
      case "duration":
        return a.durationMs - b.durationMs;
    }
  };
  const sorted = tracks
    .map((track, index) => ({ track, index }))
    .sort((a, b) => compare(a.track, b.track) || a.index - b.index)
    .map(({ track }) => track);
  return reversed ? sorted.reverse() : sorted;
}
