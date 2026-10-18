import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { usePlaybackGlide } from "./usePlaybackGlide";

// @ts-expect-error - act support flag in vitest browserless DOM environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let seen: string[] = [];

function Probe({ positionMs, frozen, label }: { positionMs: number; frozen?: boolean; label?: string }) {
  seen.push(usePlaybackGlide(positionMs, frozen));
  return <span>{label}</span>;
}

describe("usePlaybackGlide", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    seen = [];
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(() => act(() => root.unmount()));

  const render = (props: { positionMs: number; frozen?: boolean; label?: string }) => act(() => root.render(<Probe {...props} />));
  const last = () => seen[seen.length - 1];

  it("glides over one tick while playback moves forward", () => {
    render({ positionMs: 1000 });
    expect(last()).toBe("none");
    render({ positionMs: 1250 });
    expect(last()).toBe("transform 250ms linear");
  });

  it("keeps the glide when the parent re-renders without a new position", () => {
    render({ positionMs: 1000 });
    render({ positionMs: 1250 });
    render({ positionMs: 1250, label: "hover" });
    expect(last()).toBe("transform 250ms linear");
  });

  it("jumps on seeks backwards, long skips and while scrubbing", () => {
    render({ positionMs: 60_000 });
    render({ positionMs: 1000 });
    expect(last()).toBe("none");
    render({ positionMs: 30_000 });
    expect(last()).toBe("none");
    render({ positionMs: 30_250, frozen: true });
    expect(last()).toBe("none");
  });
});
