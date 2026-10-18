import { describe, expect, it, vi } from "vitest";
import type { ArtistDetails } from "@/shared/api";
import { toArtistPage } from "./artistPage";

vi.mock("@/shared/api", () => ({
  mediaUrl: (path: string) => `https://media.test${path}`,
  toMaxQualityAvatarUrl: (url: string) => `${url}?max`,
  toClientTrack: (track: { id: string }) => ({ id: track.id }),
}));

const artist = {
  type: "artist",
  id: "a1",
  name: "Band",
  bio: "  Story  ",
  cover: { url: "/face" },
  verified: true,
  tracks: [{ id: "t1" }],
  albums: [{ id: "al", title: "LP", year: 2001, cover: { url: "/lp" } }],
  singles: [{ id: "s", title: "Hit" }, { id: "e", title: "Short", releaseType: "ep" }],
} as unknown as ArtistDetails;

describe("toArtistPage", () => {
  it("maps the artist profile", () => {
    expect(toArtistPage(artist)).toMatchObject({
      title: "Band",
      description: "Story",
      coverUrl: "https://media.test/face?max",
      verified: true,
      tracks: [{ id: "t1" }],
    });
  });

  it("dates albums only when the year is known", () => {
    const page = toArtistPage(artist);
    expect(page.albums).toEqual([{ id: "al", title: "LP", coverUrl: "https://media.test/lp", releaseDate: "2001" }]);
    expect(page.singles[0]).not.toHaveProperty("releaseDate");
  });

  it("treats a release without a type as a single", () => {
    expect(toArtistPage(artist).singles.map((single) => single.releaseType)).toEqual(["single", "ep"]);
  });

  it("leaves the cover empty without a picture", () => {
    expect(toArtistPage({ ...artist, cover: undefined, bio: undefined })).toMatchObject({ coverUrl: "", description: "" });
  });
});
