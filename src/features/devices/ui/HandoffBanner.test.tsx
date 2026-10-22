import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "@/languages";
import { usePlayerStore } from "@/features/player/store/playerStore";
import type { Track } from "@/shared/types";
import { useDevicesStore } from "../store/devicesStore";
import type { RemoteDevice } from "../lib/nowPlaying";

const takeOver = vi.hoisted(() => vi.fn());

vi.mock("../lib/devicesLink", () => ({ devicesLink: { takeOver } }));
vi.mock("@/features/player", async () => ({
  usePlayerStore: (await import("@/features/player/store/playerStore")).usePlayerStore,
}));

const { default: HandoffBanner } = await import("./HandoffBanner");

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const song: Track = { id: "a", title: "Song A", artists: "", durationMs: 200_000, coverUrl: "", playCount: 0 };

function phone(playing: boolean): RemoteDevice {
  return {
    deviceId: "phone",
    name: "Android",
    platform: "android",
    ageMs: 0,
    nowPlaying: {
      queue: [song],
      index: 0,
      positionMs: 0,
      playing,
      context: null,
      contextTitle: null,
      contextCover: null,
      shuffle: false,
      repeat: "off",
    },
  };
}

describe("HandoffBanner", () => {
  let host: HTMLElement;
  let root: Root;

  const render = () =>
    act(() =>
      root.render(
        <I18nProvider>
          <HandoffBanner />
        </I18nProvider>,
      ),
    );

  const takeOverButton = () =>
    [...host.querySelectorAll("button")].find((button) => button.textContent && !button.getAttribute("aria-label"));

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    usePlayerStore.setState({ status: "paused" });
    useDevicesStore.setState({ devices: [phone(true)], receivedAt: 0 });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.clearAllMocks();
  });

  it("offers to go on here with what another device plays", () => {
    render();
    expect(host.textContent).toContain("Song A");
    expect(host.textContent).toContain("Android");
    act(() => takeOverButton()!.click());
    expect(takeOver).toHaveBeenCalledWith(phone(true));
  });

  it("stays away while music plays here", () => {
    usePlayerStore.setState({ status: "playing" });
    render();
    expect(host.textContent).toBe("");
  });

  it("stays away when the other device is paused", () => {
    useDevicesStore.setState({ devices: [phone(false)] });
    render();
    expect(host.textContent).toBe("");
  });

  it("hides once closed", async () => {
    render();
    act(() => host.querySelector<HTMLButtonElement>("button[aria-label]")!.click());
    await vi.waitFor(() => expect(host.querySelector("button")).toBeNull());
  });
});
