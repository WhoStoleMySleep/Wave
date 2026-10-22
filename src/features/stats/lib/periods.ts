import type { StatsPeriod } from "@/shared/api";

export type Season = "winter" | "spring" | "summer" | "autumn";

/** `month` is 1–12. A winter belongs to the year its January is in. */
export type PeriodKey =
  | { kind: "month"; year: number; month: number }
  | { kind: "season"; year: number; season: Season }
  | { kind: "year"; year: number };

export interface RecapPeriod {
  key: PeriodKey;
  inProgress: boolean;
}

/** Zero-based month a season starts with; winter starts in the previous December. */
const SEASON_FIRST_MONTH: Record<Season, number> = { winter: -1, spring: 2, summer: 5, autumn: 8 };
const SEASONS_BY_MONTH: Season[] = [
  "winter", "winter",
  "spring", "spring", "spring",
  "summer", "summer", "summer",
  "autumn", "autumn", "autumn",
  "winter",
];
const MONTH_ID = /^(\d{4})-(0[1-9]|1[0-2])$/;

function localRange(key: PeriodKey): [Date, Date] {
  switch (key.kind) {
    case "month":
      return [new Date(key.year, key.month - 1, 1), new Date(key.year, key.month, 1)];
    case "season": {
      const first = SEASON_FIRST_MONTH[key.season];
      return [new Date(key.year, first, 1), new Date(key.year, first + 3, 1)];
    }
    case "year":
      return [new Date(key.year, 0, 1), new Date(key.year + 1, 0, 1)];
  }
}

/** The period from local midnight to local midnight, with the offset it starts in. */
export function periodBounds(key: PeriodKey): StatsPeriod {
  const [start, end] = localRange(key);
  return { from: start.toISOString(), to: end.toISOString(), utcOffset: -start.getTimezoneOffset() };
}

export function periodId(key: PeriodKey): string {
  switch (key.kind) {
    case "month":
      return `month:${monthId(key)}`;
    case "season":
      return `season:${key.year}-${key.season}`;
    case "year":
      return `year:${key.year}`;
  }
}

export function monthId(key: { year: number; month: number }): string {
  return `${key.year}-${String(key.month).padStart(2, "0")}`;
}

export function parseMonth(id: string | null | undefined): Extract<PeriodKey, { kind: "month" }> | null {
  const match = id ? MONTH_ID.exec(id) : null;
  return match ? { kind: "month", year: Number(match[1]), month: Number(match[2]) } : null;
}

export function currentMonth(now: Date): Extract<PeriodKey, { kind: "month" }> {
  return { kind: "month", year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function seasonOf(year: number, month: number): Extract<PeriodKey, { kind: "season" }> {
  return { kind: "season", year: month === 12 ? year + 1 : year, season: SEASONS_BY_MONTH[month - 1] };
}

/** Years and then seasons that have any listening, newest first. */
export function recapPeriods(months: string[], now: Date): RecapPeriod[] {
  const years = new Map<string, PeriodKey>();
  const seasons = new Map<string, PeriodKey>();
  for (const id of months) {
    const month = parseMonth(id);
    if (!month) continue;
    const year: PeriodKey = { kind: "year", year: month.year };
    const season = seasonOf(month.year, month.month);
    years.set(periodId(year), year);
    seasons.set(periodId(season), season);
  }
  const newestFirst = (a: PeriodKey, b: PeriodKey) => localRange(b)[0].getTime() - localRange(a)[0].getTime();
  return [...[...years.values()].sort(newestFirst), ...[...seasons.values()].sort(newestFirst)].map((key) => ({
    key,
    inProgress: now < localRange(key)[1],
  }));
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

/** "October" with a capital letter, even in languages that write months in lowercase. */
export function monthName(key: { year: number; month: number }, locale: string): string {
  return capitalize(new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(key.year, key.month - 1, 1)));
}

export function monthLabel(key: { year: number; month: number }, locale: string): string {
  return `${monthName(key, locale)} ${key.year}`;
}

/** "October 2026", "Autumn 2026" or "2026"; `seasonName` translates a season. */
export function periodLabel(key: PeriodKey, locale: string, seasonName: (season: Season) => string): string {
  switch (key.kind) {
    case "month":
      return monthLabel(key, locale);
    case "season":
      return `${seasonName(key.season)} ${key.year}`;
    case "year":
      return String(key.year);
  }
}
