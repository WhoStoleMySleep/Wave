import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, type CatalogTrack } from "@/shared/api";
import { useTrackMatchStore } from "../store/trackMatchStore";
import TrackMatchModal from "./TrackMatchModal";

// @ts-expect-error - act support flag in vitest browserless DOM environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const toast = vi.fn();

vi.mock("@/shared/api", () => ({
  api: { getTrackMatch: vi.fn(), setTrackMatch: vi.fn() },
  mediaUrl: (url: string) => url,
}));
vi.mock("@/shared/ui", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/shared/ui/Dialog", () => ({
  default: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
}));
vi.mock("@/features/covers/ui/CoverImage", () => ({ default: () => null }));
vi.mock("@/languages", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/shared/utils/logger", () => ({ log: vi.fn() }));

const getTrackMatch = vi.mocked(api.getTrackMatch);
const setTrackMatch = vi.mocked(api.setTrackMatch);

function candidate(id: string, title: string): CatalogTrack {
  return { id, title, artists: [{ id: "a", name: "Кино" }], durationMs: 285_000 };
}

describe("TrackMatchModal", () => {
  let container: HTMLDivElement;
  let root: Root;

  function rows(): HTMLButtonElement[] {
    return [...container.querySelectorAll("button")];
  }

  async function openFor(id: string) {
    await act(async () => useTrackMatchStore.getState().open({ id, title: "Группа крови", artists: "Кино", coverUrl: "" }));
  }

  beforeEach(async () => {
    toast.mockReset();
    getTrackMatch.mockReset();
    setTrackMatch.mockReset();
    useTrackMatchStore.getState().close();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<TrackMatchModal />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("stays closed until a track is picked", () => {
    expect(container.textContent).toBe("");
  });

  it("lists the candidates and marks the one playing now", async () => {
    getTrackMatch.mockResolvedValue({
      status: "auto",
      youtubeId: "yt1",
      candidates: [candidate("yt1", "Группа крови"), candidate("yt2", "Группа крови (Live)")],
    });
    await openFor("dz:1");

    expect(rows().map((row) => row.textContent)).toEqual([
      "Группа кровиКино · 4:45catalogs.match_current",
      "Группа крови (Live)Кино · 4:45",
    ]);
    expect(rows()[0].disabled).toBe(true);
  });

  it("saves the chosen candidate and closes", async () => {
    getTrackMatch.mockResolvedValue({ status: "doubtful", youtubeId: "yt1", candidates: [candidate("yt1", "A"), candidate("yt2", "B")] });
    setTrackMatch.mockResolvedValue(undefined);
    await openFor("dz:1");

    await act(async () => rows()[1].click());
    expect(setTrackMatch).toHaveBeenCalledWith("dz:1", "yt2");
    expect(toast).toHaveBeenCalledWith("catalogs.match_saved", "checkmark", expect.anything());
    expect(useTrackMatchStore.getState().target).toBeNull();
  });

  it("stays open when the choice is not saved", async () => {
    getTrackMatch.mockResolvedValue({ status: "auto", candidates: [candidate("yt2", "B")] });
    setTrackMatch.mockRejectedValue(new Error("offline"));
    await openFor("dz:1");

    await act(async () => rows()[0].click());
    expect(toast).toHaveBeenCalledWith("catalogs.match_save_failed", "error");
    expect(useTrackMatchStore.getState().target).not.toBeNull();
  });

  it("says when the candidates cannot be loaded", async () => {
    getTrackMatch.mockRejectedValue(new Error("offline"));
    await openFor("dz:1");
    expect(container.textContent).toContain("catalogs.match_load_failed");
  });
});
