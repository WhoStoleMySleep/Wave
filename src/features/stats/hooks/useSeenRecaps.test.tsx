import React, { act } from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { markRecapSeen, useSeenRecaps } from "./useSeenRecaps";

describe("useSeenRecaps", () => {
  let container: HTMLDivElement;
  let root: Root;
  let seen: ReadonlySet<string> = new Set();

  function Probe() {
    seen = useSeenRecaps();
    return null;
  }

  beforeEach(() => {
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(() => act(() => root.unmount()));

  it("shows a recap as seen once it was marked and keeps it in storage", () => {
    act(() => root.render(<Probe />));
    expect(seen.has("season:2026-autumn")).toBe(false);
    act(() => markRecapSeen("season:2026-autumn"));
    expect(seen.has("season:2026-autumn")).toBe(true);
    expect(JSON.parse(localStorage.getItem("wave_recap_seen") ?? "[]")).toContain("season:2026-autumn");
  });

  it("keeps the same set when a recap is marked twice", () => {
    act(() => root.render(<Probe />));
    act(() => markRecapSeen("year:2026"));
    const before = seen;
    act(() => markRecapSeen("year:2026"));
    expect(seen).toBe(before);
  });
});
