import type { ListeningHistoryItem } from "@/shared/api";

/** Today and the six days before it. */
export const HISTORY_DAYS = 7;

export interface HistoryDay {
  /** Local midnight of the day. */
  date: Date;
  items: ListeningHistoryItem[];
  minutes: number;
}

function startOfDay(at: Date): Date {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate());
}

/** Local midnight `HISTORY_DAYS - 1` days before `now`. */
export function historyStart(now: Date): Date {
  const today = startOfDay(now);
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() - (HISTORY_DAYS - 1));
}

/** Splits newest-first history into local days, keeping the order. */
export function groupByDay(items: ListeningHistoryItem[]): HistoryDay[] {
  const days: HistoryDay[] = [];
  let current: HistoryDay | undefined;
  let playedMs = 0;
  for (const item of items) {
    const date = startOfDay(new Date(item.listenedAt));
    if (current?.date.getTime() !== date.getTime()) {
      if (current) current.minutes = Math.round(playedMs / 60_000);
      current = { date, items: [], minutes: 0 };
      playedMs = 0;
      days.push(current);
    }
    current.items.push(item);
    playedMs += item.playedDurationMs;
  }
  if (current) current.minutes = Math.round(playedMs / 60_000);
  return days;
}

/** How many whole days `date` lies before `now`'s day: 0 is today, 1 is yesterday. */
export function daysAgo(date: Date, now: Date): number {
  const today = startOfDay(now);
  const day = startOfDay(date);
  return Math.round((today.getTime() - day.getTime()) / 86_400_000);
}
