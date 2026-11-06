// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useNoTouchInertia } from "./useNoTouchInertia";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Pane({ enabled }: { enabled: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useNoTouchInertia(ref, enabled);
  return <div ref={ref} data-testid="pane" />;
}

function move(element: Element): Event {
  const event = new Event("touchmove", { bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
}

describe("useNoTouchInertia", () => {
  let root: Root | null = null;

  function renderPane(enabled: boolean): Element {
    const host = document.createElement("div");
    root = createRoot(host);
    act(() => root?.render(<Pane enabled={enabled} />));
    return host.querySelector("[data-testid=pane]")!;
  }

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
  });

  it("cancels touch moves on the element", () => {
    expect(move(renderPane(true)).defaultPrevented).toBe(true);
  });

  it("leaves touch moves alone when disabled", () => {
    expect(move(renderPane(false)).defaultPrevented).toBe(false);
  });

  it("stops cancelling after unmount", () => {
    const pane = renderPane(true);
    act(() => root?.unmount());
    root = null;
    expect(move(pane).defaultPrevented).toBe(false);
  });
});
