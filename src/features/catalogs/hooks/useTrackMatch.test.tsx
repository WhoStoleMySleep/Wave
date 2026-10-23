import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, type TrackMatch } from "@/shared/api";
import { useTrackMatch, type TrackMatchState } from "./useTrackMatch";

// @ts-expect-error - act support flag in vitest browserless DOM environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/shared/api", () => ({ api: { getTrackMatch: vi.fn(), setTrackMatch: vi.fn() } }));
vi.mock("@/shared/utils/logger", () => ({ log: vi.fn() }));

const getTrackMatch = vi.mocked(api.getTrackMatch);
const setTrackMatch = vi.mocked(api.setTrackMatch);
const match: TrackMatch = { status: "auto", youtubeId: "yt1", candidates: [] };

describe("useTrackMatch", () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: TrackMatchState;

  function Probe({ id }: { id: string | null }) {
    latest = useTrackMatch(id);
    return null;
  }

  async function render(id: string | null) {
    await act(async () => root.render(<Probe id={id} />));
  }

  beforeEach(() => {
    getTrackMatch.mockReset();
    setTrackMatch.mockReset();
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
  });

  it("loads nothing without a track", async () => {
    await render(null);
    expect(getTrackMatch).not.toHaveBeenCalled();
    expect(latest).toMatchObject({ match: null, loading: false, error: null });
  });

  it("loads the match of the track", async () => {
    getTrackMatch.mockResolvedValue(match);
    await render("dz:1");
    expect(getTrackMatch).toHaveBeenCalledWith("dz:1");
    expect(latest).toMatchObject({ match, loading: false });
  });

  it("reports a failed load", async () => {
    getTrackMatch.mockRejectedValue(new Error("offline"));
    await render("dz:1");
    expect(latest.error?.message).toBe("offline");
    expect(latest.loading).toBe(false);
  });

  it("does not show the match of the previous track", async () => {
    getTrackMatch.mockResolvedValueOnce(match).mockReturnValueOnce(new Promise(() => {}));
    await render("dz:1");
    await render("dz:2");
    expect(latest).toMatchObject({ match: null, loading: true });
  });

  it("tells whether the choice was saved", async () => {
    getTrackMatch.mockResolvedValue(match);
    setTrackMatch.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("offline"));
    await render("dz:1");
    let saved = false;
    await act(async () => {
      saved = await latest.choose("yt2");
    });
    expect(saved).toBe(true);
    expect(setTrackMatch).toHaveBeenCalledWith("dz:1", "yt2");
    await act(async () => {
      saved = await latest.choose("yt3");
    });
    expect(saved).toBe(false);
    expect(latest.saving).toBe(false);
  });
});
