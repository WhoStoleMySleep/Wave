import React, { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { useCountUp } from "./useCountUp";

describe("useCountUp", () => {
  let container: HTMLDivElement;
  let root: Root;
  let value = -1;

  function Probe({ target }: { target: number }) {
    value = useCountUp(target, 1000);
    return null;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("starts at zero, passes through the middle and lands on the target", () => {
    act(() => root.render(<Probe target={1000} />));
    expect(value).toBe(0);
    act(() => vi.advanceTimersByTime(500));
    expect(value).toBeGreaterThan(500);
    expect(value).toBeLessThan(1000);
    act(() => vi.advanceTimersByTime(600));
    expect(value).toBe(1000);
  });
});
