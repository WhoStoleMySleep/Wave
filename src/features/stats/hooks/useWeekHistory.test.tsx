import React, { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { useWeekHistory } from "./useWeekHistory";
import { api } from "@/shared/api";

vi.mock("@/shared/api", () => ({
  api: { getHistory: vi.fn() },
}));

function item(id: string) {
  return { id, listenedAt: "2026-10-22T10:00:00.000Z" };
}

describe("useWeekHistory", () => {
  let container: HTMLDivElement;
  let root: Root;
  let result: ReturnType<typeof useWeekHistory>;

  function Probe() {
    result = useWeekHistory();
    return null;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 22, 15, 0));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
    vi.useRealTimers();
  });

  it("loads the week from local midnight six days ago and appends the next page", async () => {
    vi.mocked(api.getHistory)
      .mockResolvedValueOnce({ items: [item("b")], nextCursor: "1" } as never)
      .mockResolvedValueOnce({ items: [item("a")], nextCursor: null } as never);

    await act(async () => root.render(<Probe />));
    expect(api.getHistory).toHaveBeenCalledWith(undefined, 100, { from: new Date(2026, 9, 16).toISOString() });
    expect(result.items.map((it) => it.id)).toEqual(["b"]);
    expect(result.hasMore).toBe(true);

    await act(async () => result.loadMore());
    expect(api.getHistory).toHaveBeenLastCalledWith("1", 100, { from: new Date(2026, 9, 16).toISOString() });
    expect(result.items.map((it) => it.id)).toEqual(["b", "a"]);
    expect(result.hasMore).toBe(false);
  });

  it("reports a failed load and keeps what was shown", async () => {
    vi.mocked(api.getHistory).mockRejectedValueOnce(new Error("offline"));
    await act(async () => root.render(<Probe />));
    expect(result.error?.message).toBe("offline");
    expect(result.items).toEqual([]);
    expect(result.isLoading).toBe(false);
  });
});
