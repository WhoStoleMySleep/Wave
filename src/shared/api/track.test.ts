import React from "react";
import { describe, it, expect } from "vitest";
import { getApiBaseUrl } from "./baseUrl";
import { toClientTrack } from "./track";

describe("toClientTrack", () => {
  it("maps backend track properly", () => {
    const backend = {
      id: "4IbRT6Vfl_U",
      title: "One Dance",
      artists: [{ id: "UCECJhbsxgI5hWFz8EU0TY-g", name: "Drake" }],
      durationMs: 227000,
    };
    const c1 = toClientTrack(backend);
    expect(c1.artistId).toBe("UCECJhbsxgI5hWFz8EU0TY-g");
    expect(c1.artistList).toEqual([{ id: "UCECJhbsxgI5hWFz8EU0TY-g", name: "Drake" }]);
    expect(c1.artists).toBe("Drake");

    const c2 = toClientTrack(c1);
    expect(c2.artistId).toBe("UCECJhbsxgI5hWFz8EU0TY-g");
    expect(c2.artistList).toEqual([{ id: "UCECJhbsxgI5hWFz8EU0TY-g", name: "Drake" }]);
    expect(c2.artists).toBe("Drake");
  });

  it("handles track with singular artist or comma-separated string", () => {
    const t1 = toClientTrack({
      id: "1",
      title: "Test",
      artist: { id: "art1", name: "Solo Artist" },
    });
    expect(t1.artistId).toBe("art1");
    expect(t1.artistList).toEqual([{ id: "art1", name: "Solo Artist" }]);
    expect(t1.artists).toBe("Solo Artist");

    const t2 = toClientTrack({
      id: "2",
      title: "Test 2",
      artists: "Artist A, Artist B",
      artistId: "idA",
    });
    expect(t2.artistId).toBe("idA");
    expect(t2.artistList).toEqual([
      { id: "idA", name: "Artist A" },
      { id: "", name: "Artist B" },
    ]);
  });

  it("maps album metadata when present", () => {
    const t = toClientTrack({
      id: "track1",
      title: "Come Together",
      album: { id: "alb1", title: "Abbey Road" },
    });
    expect(t.album).toEqual({ id: "alb1", title: "Abbey Road" });
  });

  it("returns an empty track for a missing source", () => {
    expect(toClientTrack(null)).toMatchObject({ id: "", title: "", artists: "", coverUrl: "", durationMs: 0 });
  });

  it("resolves a server cover against the API and keeps a ready cover URL", () => {
    const fromServer = toClientTrack({ id: "1", title: "T", cover: { url: "/covers/1.jpg" } });
    expect(fromServer.coverUrl).toBe(`${getApiBaseUrl()}/covers/1.jpg`);
    const fromClient = toClientTrack({ id: "1", title: "T", coverUrl: "https://cdn/1.jpg" });
    expect(fromClient.coverUrl).toBe("https://cdn/1.jpg");
  });

  it("skips unmatched artists when picking the primary artist", () => {
    const track = toClientTrack({
      id: "1",
      title: "T",
      artists: [{ id: "unknown", name: "Guest" }, { id: "a2", name: "Main" }],
    });
    expect(track.artistId).toBe("a2");
    expect(track.artists).toBe("Guest, Main");
  });

  it("reads snake_case fields kept from older builds", () => {
    const track = toClientTrack({ id: "1", title: "T", artist: "Solo", artist_id: "s1", cover_url: "c.jpg", duration_ms: 1000 });
    expect(track).toMatchObject({ artists: "Solo", artistId: "s1", coverUrl: "c.jpg", durationMs: 1000 });
  });

  it("drops an album without id and title", () => {
    expect(toClientTrack({ id: "1", title: "T", album: {} }).album).toBeUndefined();
  });


  it("renders ArtistLink and tests click behavior", async () => {
    const { createRoot } = await import("react-dom/client");
    const { default: ArtistLink } = await import("../../features/artist/ui/ArtistLink");
    const { MemoryRouter } = await import("react-router-dom");
    const { act } = await import("react");

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    let currentLocation = "";
    function LocationProbe() {
      const location = (require("react-router-dom") as any).useLocation();
      currentLocation = location.pathname + location.search;
      return null;
    }

    await act(async () => {
      root.render(
        React.createElement(
          MemoryRouter,
          { initialEntries: ["/"] },
          React.createElement(LocationProbe, null),
          React.createElement(ArtistLink, {
            name: "Drake",
            artistId: "UCECJhbsxgI5hWFz8EU0TY-g",
            artistList: [{ id: "UCECJhbsxgI5hWFz8EU0TY-g", name: "Drake" }],
          })
        )
      );
    });

    const button = container.querySelector("[role='button']") as HTMLElement;
    expect(button).not.toBeNull();
    expect(button?.textContent).toBe("Drake");
    expect(currentLocation).toBe("/");

    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(currentLocation).toBe("/artist?id=UCECJhbsxgI5hWFz8EU0TY-g");

    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it("navigates with artist name when artistId is absent", async () => {
    const { createRoot } = await import("react-dom/client");
    const { default: ArtistLink } = await import("../../features/artist/ui/ArtistLink");
    const { MemoryRouter } = await import("react-router-dom");
    const { act } = await import("react");

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    let currentLocation = "";
    function LocationProbe() {
      const location = (require("react-router-dom") as any).useLocation();
      currentLocation = location.pathname + location.search;
      return null;
    }

    await act(async () => {
      root.render(
        React.createElement(
          MemoryRouter,
          { initialEntries: ["/"] },
          React.createElement(LocationProbe, null),
          React.createElement(ArtistLink, {
            name: "The Beatles",
          })
        )
      );
    });

    const button = container.querySelector("[role='button']") as HTMLElement;
    expect(button).not.toBeNull();
    expect(button?.textContent).toBe("The Beatles");

    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(currentLocation).toBe("/artist?id=The%20Beatles");

    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
  });
});

