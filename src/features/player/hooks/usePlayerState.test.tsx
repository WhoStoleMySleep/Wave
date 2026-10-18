import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { INITIAL_PLAYER_STATE } from "../store/playerDefaults";
import { usePlayerStore } from "../store/playerStore";
import { usePlayerState } from "./usePlayerState";

// @ts-expect-error - act support flag in vitest browserless DOM environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const renders = { first: 0, second: 0 };

function Status({ name }: { name: keyof typeof renders }) {
  const player = usePlayerState({ position: false });
  renders[name]++;
  return <span data-name={name}>{player.status}</span>;
}

function statusOf(container: HTMLElement, name: string): string | null {
  return container.querySelector(`[data-name="${name}"]`)?.textContent ?? null;
}

describe("usePlayerState without position", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    usePlayerStore.setState(INITIAL_PLAYER_STATE);
    container = document.createElement("div");
    root = createRoot(container);
    act(() => root.render(<><Status name="first" /><Status name="second" /></>));
  });

  afterEach(() => act(() => root.unmount()));

  it("updates every component that reads it", () => {
    act(() => usePlayerStore.setState({ status: "playing" }));
    expect(statusOf(container, "first")).toBe("playing");
    expect(statusOf(container, "second")).toBe("playing");
    act(() => usePlayerStore.setState({ status: "paused" }));
    expect(statusOf(container, "second")).toBe("paused");
  });

  it("skips renders when only the position moves", () => {
    renders.first = 0;
    renders.second = 0;
    act(() => usePlayerStore.setState({ positionMs: 1000 }));
    act(() => usePlayerStore.setState({ positionMs: 2000 }));
    expect(renders).toEqual({ first: 0, second: 0 });
  });
});
