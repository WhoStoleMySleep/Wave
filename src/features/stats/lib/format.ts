import type { StatsWeek } from "@/shared/api";

/** A local date from `YYYY-MM-DD`; `new Date(string)` would read it as UTC midnight. */
export function localDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

/** "Oct 12 – 18" in the locale's own way. */
export function formatWeek(week: StatsWeek, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).formatRange(localDate(week.start), localDate(week.end));
}

/** "5 October" or "October 5". */
export function formatDay(value: string | Date, locale: string): string {
  const date = typeof value === "string" ? localDate(value) : value;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(date);
}

export function formatWeekday(date: Date, locale: string): string {
  const text = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(date);
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

/** The start of an hour of the day: "23:00" or "11:00 PM". */
export function formatHour(hour: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(new Date(2000, 0, 1, hour));
}

export function formatTime(instant: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(instant));
}
