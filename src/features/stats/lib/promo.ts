import { periodId, periodRange, type PeriodKey, type RecapPeriod } from "./periods";

/** Days before the end of a period its recap is offered on the home page. */
const LEAD_DAYS = { season: 5, year: 30 } as const;
/** Days into the next period the offer stays. */
const TAIL_DAYS = 5;

function shiftDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function isOffered(key: PeriodKey, now: Date): boolean {
  if (key.kind === "month") return false;
  const [, end] = periodRange(key);
  return now >= shiftDays(end, -LEAD_DAYS[key.kind]) && now < shiftDays(end, TAIL_DAYS);
}

/**
 * The recap the home page offers at `now`, if any: a season around its end,
 * a year through December and into January. Of two at once the one ending
 * first goes before; a recap already watched is not offered again.
 */
export function offeredRecap(periods: RecapPeriod[], now: Date, seen: ReadonlySet<string>): PeriodKey | null {
  const offered = periods
    .map(({ key }) => key)
    .filter((key) => isOffered(key, now) && !seen.has(periodId(key)))
    .sort((a, b) => periodRange(a)[1].getTime() - periodRange(b)[1].getTime());
  return offered[0] ?? null;
}

/** Whether any recap could be offered at `now`, before knowing what was listened to. */
export function isRecapSeason(now: Date): boolean {
  const year = now.getFullYear();
  const keys: PeriodKey[] = [
    { kind: "year", year },
    { kind: "year", year: year - 1 },
    ...(["winter", "spring", "summer", "autumn"] as const).flatMap((season) => [
      { kind: "season" as const, year, season },
      { kind: "season" as const, year: year + 1, season },
    ]),
  ];
  return keys.some((key) => isOffered(key, now));
}
