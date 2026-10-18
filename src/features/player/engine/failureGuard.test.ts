import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "@/shared/types";
import { usePlayerStore } from "../store/playerStore";
import { FailureGuard } from "./failureGuard";

const track: Track = { id: "t", title: "t", artists: "", durationMs: 1, coverUrl: "", playCount: 0 };

describe("FailureGuard", () => {
  let skip = vi.fn<() => void>();
  let stop = vi.fn<() => void>();
  let guard: FailureGuard;

  beforeEach(() => {
    usePlayerStore.setState({ currentTrack: track });
    skip = vi.fn();
    stop = vi.fn();
    guard = new FailureGuard({ skip, stop });
  });

  it("skips a failed track", () => {
    guard.handle({ trackId: "t", message: "boom" });
    expect(skip).toHaveBeenCalledTimes(1);
  });

  it("ignores a failure of a track no longer current", () => {
    guard.handle({ trackId: "old", message: "boom" });
    expect(skip).not.toHaveBeenCalled();
  });

  it("stops after more than three failures in a row", () => {
    for (let i = 0; i < 4; i++) guard.handle({ trackId: "t", message: "boom" });
    expect(skip).toHaveBeenCalledTimes(3);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("starts counting again after a track plays", () => {
    for (let i = 0; i < 3; i++) guard.handle({ trackId: "t", message: "boom" });
    guard.reset();
    guard.handle({ trackId: "t", message: "boom" });
    expect(stop).not.toHaveBeenCalled();
  });
});
