import { describe, it, expect } from "vitest";
import { recapPeriods } from "./periods";
import { isRecapSeason, offeredRecap } from "./promo";

const MONTHS = ["2026-12", "2026-11", "2026-10", "2026-09", "2026-08", "2026-02", "2026-01", "2025-12"];
const NONE = new Set<string>();

function offered(now: Date, seen: ReadonlySet<string> = NONE) {
  return offeredRecap(recapPeriods(MONTHS, now), now, seen);
}

describe("offeredRecap", () => {
  it("offers a season from five days before its end", () => {
    expect(offered(new Date(2026, 10, 25, 23, 59))).toBeNull();
    expect(offered(new Date(2026, 10, 26))).toEqual({ kind: "season", year: 2026, season: "autumn" });
  });

  it("keeps a season for five days of the next one", () => {
    expect(offered(new Date(2026, 8, 5, 23, 59))).toEqual({ kind: "season", year: 2026, season: "summer" });
    expect(offered(new Date(2026, 8, 6))).toBeNull();
  });

  it("offers a year from thirty days before its end to five days after", () => {
    expect(offered(new Date(2026, 11, 10))).toEqual({ kind: "year", year: 2026 });
    expect(offered(new Date(2027, 0, 5, 12))).toEqual({ kind: "year", year: 2026 });
    expect(offered(new Date(2027, 0, 6))).toBeNull();
  });

  it("puts the season before the year when both are on", () => {
    const now = new Date(2026, 11, 3);
    expect(offered(now)).toEqual({ kind: "season", year: 2026, season: "autumn" });
    expect(offered(now, new Set(["season:2026-autumn"]))).toEqual({ kind: "year", year: 2026 });
  });

  it("does not offer a period without listening", () => {
    expect(offeredRecap(recapPeriods(["2026-10"], new Date(2026, 4, 30)), new Date(2026, 4, 30), NONE)).toBeNull();
  });
});

describe("isRecapSeason", () => {
  it("is on only around the ends of seasons and years", () => {
    expect(isRecapSeason(new Date(2026, 9, 22))).toBe(false);
    expect(isRecapSeason(new Date(2026, 1, 26))).toBe(true);
    expect(isRecapSeason(new Date(2026, 11, 20))).toBe(true);
    expect(isRecapSeason(new Date(2027, 0, 3))).toBe(true);
  });
});
