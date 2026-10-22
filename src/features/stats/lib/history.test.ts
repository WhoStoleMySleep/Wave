import { describe, it, expect } from "vitest";
import type { ListeningHistoryItem } from "@/shared/api";
import { daysAgo, groupByDay, historyStart } from "./history";

function item(id: string, listenedAt: Date, playedDurationMs = 60_000): ListeningHistoryItem {
  return {
    id,
    playbackSessionId: id,
    listeningSessionId: "ls",
    track: { id, title: id, artists: [], durationMs: 180_000 },
    playedDurationMs,
    completionRate: 1,
    completed: true,
    skipped: false,
    loopCount: 0,
    hasSeekBackward: false,
    listenedAt: listenedAt.toISOString(),
  };
}

describe("groupByDay", () => {
  it("splits plays by local day and sums the minutes", () => {
    const days = groupByDay([
      item("c", new Date(2026, 9, 22, 23, 50), 90_000),
      item("b", new Date(2026, 9, 22, 0, 10), 90_000),
      item("a", new Date(2026, 9, 21, 23, 59)),
    ]);
    expect(days.map((day) => day.date)).toEqual([new Date(2026, 9, 22), new Date(2026, 9, 21)]);
    expect(days.map((day) => day.items.map((it) => it.id))).toEqual([["c", "b"], ["a"]]);
    expect(days.map((day) => day.minutes)).toEqual([3, 1]);
  });

  it("returns no days for no plays", () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe("historyStart", () => {
  it("goes back to midnight six days before today", () => {
    expect(historyStart(new Date(2026, 9, 22, 15, 0))).toEqual(new Date(2026, 9, 16));
  });

  it("crosses a month boundary", () => {
    expect(historyStart(new Date(2026, 10, 2, 1, 0))).toEqual(new Date(2026, 9, 27));
  });
});

describe("daysAgo", () => {
  it("counts calendar days, not 24-hour spans", () => {
    const now = new Date(2026, 9, 22, 0, 30);
    expect(daysAgo(new Date(2026, 9, 22, 0, 1), now)).toBe(0);
    expect(daysAgo(new Date(2026, 9, 21, 23, 59), now)).toBe(1);
    expect(daysAgo(new Date(2026, 9, 16, 12, 0), now)).toBe(6);
  });
});
