import { describe, expect, it } from "vitest";
import { isCatalogTrack } from "./catalogTrack";

describe("isCatalogTrack", () => {
  it("recognises Deezer and Yandex tracks", () => {
    expect(isCatalogTrack("dz:138547415")).toBe(true);
    expect(isCatalogTrack("ym:38633712")).toBe(true);
    expect(isCatalogTrack("sp:4i65zW2W1sHvWjOQpl5hVe")).toBe(true);
  });

  it("leaves YouTube tracks and empty ids alone", () => {
    expect(isCatalogTrack("dQw4w9WgXcQ")).toBe(false);
    expect(isCatalogTrack("dz:")).toBe(false);
    expect(isCatalogTrack(undefined)).toBe(false);
    expect(isCatalogTrack("")).toBe(false);
  });
});
