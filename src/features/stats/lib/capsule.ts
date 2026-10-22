import type { DayStat, ListeningStats } from "@/shared/api";

/** Minutes for every day of the month, zero where nothing played. */
export function monthDays(year: number, month: number, days: DayStat[]): number[] {
  const count = new Date(year, month, 0).getDate();
  const minutes = Array<number>(count).fill(0);
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  for (const day of days) {
    if (!day.date.startsWith(prefix)) continue;
    const index = Number(day.date.slice(prefix.length)) - 1;
    if (index >= 0 && index < count) minutes[index] = day.minutes;
  }
  return minutes;
}

/** Artists whose photos the capsule shows, the top one first. */
export function capsuleArtistIds(stats: ListeningStats): string[] {
  return [stats.topArtists[0]?.artist, ...(stats.combo?.artists ?? []), stats.discovery?.artist]
    .map((artist) => artist?.id ?? "")
    .filter(Boolean);
}
