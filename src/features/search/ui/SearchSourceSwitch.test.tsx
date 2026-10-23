import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useSearchSourceStore } from "../store/searchSourceStore";
import { SearchSourceSwitch } from "./SearchSourceSwitch";

// @ts-expect-error - act support flag in vitest browserless DOM environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/languages", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe("SearchSourceSwitch", () => {
  let container: HTMLDivElement;
  let root: Root;

  function button(name: string): HTMLButtonElement {
    const found = [...container.querySelectorAll("button")].find((b) => b.textContent === name);
    if (!found) throw new Error(`no ${name} button`);
    return found;
  }

  beforeEach(async () => {
    useSearchSourceStore.setState({ source: "youtube" });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<SearchSourceSwitch />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows the catalog search looks in as pressed", () => {
    expect(button("search.sources.youtube").getAttribute("aria-pressed")).toBe("true");
    expect(button("search.sources.deezer").getAttribute("aria-pressed")).toBe("false");
  });

  it("offers every catalog", () => {
    expect(button("search.sources.yandex").getAttribute("aria-pressed")).toBe("false");
    expect(button("search.sources.spotify").getAttribute("aria-pressed")).toBe("false");
  });

  it("switches search to the catalog picked", async () => {
    await act(async () => button("search.sources.deezer").click());
    expect(useSearchSourceStore.getState().source).toBe("deezer");
    expect(button("search.sources.deezer").getAttribute("aria-pressed")).toBe("true");
  });
});
