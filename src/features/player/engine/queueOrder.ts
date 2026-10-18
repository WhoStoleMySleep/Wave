import type { PlayerState } from "../store/playerStore";
import type { Track } from "@/shared/types";

type QueuePosition = Pick<PlayerState, "queue" | "currentIndex" | "repeat">;

export interface ShuffledQueue {
  queue: Track[];
  original: Track[];
}

export interface ReorderedQueue {
  queue: Track[];
  index: number;
}

const itemKey = (track: Track) => track.playlistItemId ?? track.id;

/**
 * Fisher–Yates shuffle, O(n).
 * @returns a shuffled copy; `items` stays untouched
 */
export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Shuffles the tracks after `index`; played tracks and the current one stay in place.
 * @returns the new queue and the upcoming tracks in their order before the shuffle
 */
export function shuffleUpcoming(queue: readonly Track[], index: number): ShuffledQueue {
  const upcoming = queue.slice(index + 1);
  return { queue: [...queue.slice(0, index + 1), ...shuffle(upcoming)], original: upcoming };
}

/**
 * Restores the order of the tracks after `index` from `reference` in O(n + m).
 * Tracks the reference doesn't know go to the end in their current order.
 */
export function unshuffleUpcoming(queue: readonly Track[], index: number, reference: readonly Track[]): Track[] {
  const upcoming = queue.slice(index + 1);
  return [...queue.slice(0, index + 1), ...restoreOrder(upcoming, reference)];
}

function restoreOrder(upcoming: Track[], reference: readonly Track[]): Track[] {
  if (reference.length === 0) return upcoming;
  const groups = new Map<string, Track[]>();
  for (const track of upcoming) {
    const group = groups.get(track.id);
    if (group) group.push(track);
    else groups.set(track.id, [track]);
  }
  const ordered: Track[] = [];
  for (const { id } of reference) {
    const group = groups.get(id);
    if (!group) continue;
    ordered.push(...group);
    groups.delete(id);
  }
  return [...ordered, ...upcoming.filter((track) => groups.has(track.id))];
}

/** Fills the cover and duration every row needs; a missing cover falls back to the selected track's. */
export function normalizeQueue(queue: readonly Track[], selected: Track): Track[] {
  if (queue.length === 0) return [selected];
  return queue.map((item) => ({
    ...item,
    coverUrl: item.coverUrl || selected.coverUrl,
    durationMs: item.durationMs ?? 0,
  }));
}

export function insertAfter(queue: readonly Track[], index: number, track: Track): Track[] {
  return [...queue.slice(0, index + 1), track, ...queue.slice(index + 1)];
}

/**
 * Moves one row and keeps `currentIndex` on the playing track.
 * @returns null when the move is out of range or in place
 */
export function moveItem(queue: readonly Track[], currentIndex: number, from: number, to: number): ReorderedQueue | null {
  const inRange = (i: number) => i >= 0 && i < queue.length;
  if (from === to || !inRange(from) || !inRange(to)) return null;
  const next = [...queue];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return { queue: next, index: followMovedIndex(currentIndex, from, to) };
}

function followMovedIndex(current: number, from: number, to: number): number {
  if (current === from) return to;
  if (from < current && to >= current) return current - 1;
  if (from > current && to <= current) return current + 1;
  return current;
}

/**
 * Takes the new sort of the playing list and keeps the current track where it is;
 * tracks queued by hand or by the wave stay right after it.
 * @returns null when the current track is no longer in the list
 */
export function mergeContextOrder(tracks: readonly Track[], queue: readonly Track[], currentIndex: number): ReorderedQueue | null {
  const current = queue[currentIndex];
  if (!current || tracks.length === 0) return null;
  const currentKey = itemKey(current);
  const index = tracks.findIndex((track) => itemKey(track) === currentKey);
  if (index < 0) return null;
  const listed = new Set(tracks.map(itemKey));
  const extras = queue.slice(currentIndex + 1).filter((track) => !listed.has(itemKey(track)));
  return { queue: [...tracks.slice(0, index + 1), ...extras, ...tracks.slice(index + 1)], index };
}

/** @returns index a skip forward lands on, or null when playback stops at the end */
export function nextIndex({ queue, currentIndex, repeat }: QueuePosition, isAutoEnd = false): number | null {
  if (queue.length === 0 || currentIndex < 0) return null;
  if (isAutoEnd && repeat === "one") return currentIndex;
  if (currentIndex + 1 < queue.length) return currentIndex + 1;
  return repeat === "off" ? null : 0;
}

/** The first track stays put unless the whole queue repeats. */
export function previousIndex({ queue, currentIndex, repeat }: QueuePosition): number {
  if (currentIndex > 0) return currentIndex - 1;
  return repeat === "all" ? queue.length - 1 : 0;
}

export function hasPrevious({ queue, currentIndex, repeat }: QueuePosition): boolean {
  return currentIndex > 0 || (repeat === "all" && queue.length > 1);
}

/** @returns the track to preload, wrapping around when the queue repeats */
export function upcomingTrack({ queue, currentIndex, repeat }: QueuePosition): Track | null {
  if (currentIndex >= 0 && currentIndex < queue.length - 1) return queue[currentIndex + 1];
  if (repeat === "all" && queue.length > 0) return queue[0];
  return null;
}
