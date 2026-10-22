import { describe, it, expect } from "vitest";
import { parseMonth, periodBounds, periodLabel, recapPeriods, seasonOf } from "./periods";

const seasonName = (season: string) => season.charAt(0).toUpperCase() + season.slice(1);

describe("periodBounds", () => {
  it("runs a month from local midnight of the 1st to the next month", () => {
    const bounds = periodBounds({ kind: "month", year: 2026, month: 12 });
    expect(new Date(bounds.from)).toEqual(new Date(2026, 11, 1));
    expect(new Date(bounds.to)).toEqual(new Date(2027, 0, 1));
    expect(bounds.utcOffset).toBe(-new Date(2026, 11, 1).getTimezoneOffset());
  });

  it("starts a winter in the previous December", () => {
    const bounds = periodBounds({ kind: "season", year: 2026, season: "winter" });
    expect(new Date(bounds.from)).toEqual(new Date(2025, 11, 1));
    expect(new Date(bounds.to)).toEqual(new Date(2026, 2, 1));
  });

  it("covers a whole year", () => {
    const bounds = periodBounds({ kind: "year", year: 2026 });
    expect(new Date(bounds.from)).toEqual(new Date(2026, 0, 1));
    expect(new Date(bounds.to)).toEqual(new Date(2027, 0, 1));
  });
});

describe("seasonOf", () => {
  it("puts December into the next year's winter", () => {
    expect(seasonOf(2025, 12)).toEqual({ kind: "season", year: 2026, season: "winter" });
    expect(seasonOf(2026, 2)).toEqual({ kind: "season", year: 2026, season: "winter" });
    expect(seasonOf(2026, 3).season).toBe("spring");
    expect(seasonOf(2026, 11).season).toBe("autumn");
  });
});

describe("parseMonth", () => {
  it("reads YYYY-MM and rejects anything else", () => {
    expect(parseMonth("2026-10")).toEqual({ kind: "month", year: 2026, month: 10 });
    expect(parseMonth("2026-13")).toBeNull();
    expect(parseMonth("")).toBeNull();
    expect(parseMonth(null)).toBeNull();
  });
});

describe("recapPeriods", () => {
  it("offers years then seasons with listening, newest first", () => {
    const periods = recapPeriods(["2026-10", "2026-09", "2026-07", "2025-12", "bad"], new Date(2026, 9, 22));
    expect(periods.map(({ key }) => periodLabel(key, "en", seasonName))).toEqual([
      "2026",
      "2025",
      "Autumn 2026",
      "Summer 2026",
      "Winter 2026",
    ]);
    expect(periods.map(({ inProgress }) => inProgress)).toEqual([true, false, true, false, false]);
  });

  it("offers nothing without listening", () => {
    expect(recapPeriods([], new Date())).toEqual([]);
  });
});

describe("periodLabel", () => {
  it("names a month in the locale with a capital letter", () => {
    expect(periodLabel({ kind: "month", year: 2026, month: 10 }, "ru", seasonName)).toBe("Октябрь 2026");
    expect(periodLabel({ kind: "month", year: 2026, month: 10 }, "en", seasonName)).toBe("October 2026");
  });
});
