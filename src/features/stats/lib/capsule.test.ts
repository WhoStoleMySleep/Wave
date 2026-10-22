import { describe, it, expect } from "vitest";
import type { ListeningStats } from "@/shared/api";
import { capsuleArtistIds, monthDays } from "./capsule";

describe("monthDays", () => {
  it("lays the minutes out over every day of the month", () => {
    const days = monthDays(2026, 2, [
      { date: "2026-02-01", minutes: 5 },
      { date: "2026-02-28", minutes: 7 },
      { date: "2026-03-01", minutes: 9 },
    ]);
    expect(days).toHaveLength(28);
    expect(days[0]).toBe(5);
    expect(days[27]).toBe(7);
    expect(days.reduce((sum, value) => sum + value, 0)).toBe(12);
  });
});

describe("capsuleArtistIds", () => {
  it("takes the top, combo and discovery artists with channel ids", () => {
    const stats = {
      topArtists: [{ artist: { id: "UCa", name: "A" }, plays: 3, minutes: 9 }],
      combo: { artists: [{ id: "UCb", name: "B" }, { id: "", name: "C" }], week: { start: "", end: "" } },
      discovery: { artist: { id: "UCd", name: "D" }, plays: 1, minutes: 3 },
    } as ListeningStats;
    expect(capsuleArtistIds(stats)).toEqual(["UCa", "UCb", "UCd"]);
  });
});
