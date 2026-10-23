import { describe, expect, it } from "vitest";
import { isCatalogTrack } from "./catalogTrack";

describe("isCatalogTrack", () => {
  it("recognises a Deezer track", () => {
    expect(isCatalogTrack("dz:138547415")).toBe(true);
  });

  it("leaves YouTube tracks and empty ids alone", () => {
    expect(isCatalogTrack("dQw4w9WgXcQ")).toBe(false);
    expect(isCatalogTrack("dz:")).toBe(false);
    expect(isCatalogTrack(undefined)).toBe(false);
    expect(isCatalogTrack("")).toBe(false);
  });
});
