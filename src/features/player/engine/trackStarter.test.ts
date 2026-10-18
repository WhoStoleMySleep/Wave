import { describe, expect, it } from "vitest";
import { isLiveLoad, type LoadTicket } from "./trackStarter";

const ticket = (epoch: number, signal = new AbortController().signal): LoadTicket => ({
  epoch,
  signal,
  startPositionMs: 0,
  crossfadeMs: 0,
  releaseHeadStart: () => {},
  startedAt: 0,
});

describe("isLiveLoad", () => {
  it("holds for the latest load", () => {
    expect(isLiveLoad(ticket(3), 3)).toBe(true);
  });

  it("fails once a newer load started", () => {
    expect(isLiveLoad(ticket(2), 3)).toBe(false);
  });

  it("fails once the load was aborted", () => {
    const controller = new AbortController();
    controller.abort();
    expect(isLiveLoad(ticket(3, controller.signal), 3)).toBe(false);
  });
});
