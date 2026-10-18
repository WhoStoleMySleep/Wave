import { describe, expect, it } from "vitest";
import { apiPath, withQuery } from "./apiPath";

describe("apiPath", () => {
  it("encodes every interpolated segment", () => {
    expect(apiPath`/v1/me/playlists/${"a/b"}/items/${"c d"}`).toBe("/v1/me/playlists/a%2Fb/items/c%20d");
  });

  it("keeps a path without parameters as is", () => {
    expect(apiPath`/v1/me`).toBe("/v1/me");
  });
});

describe("withQuery", () => {
  it("omits undefined, null and empty parameters", () => {
    expect(withQuery("/v1/me/history", { limit: 30, cursor: undefined, q: "", x: null })).toBe("/v1/me/history?limit=30");
  });

  it("returns the bare path when nothing is left", () => {
    expect(withQuery("/v1/search", { cursor: undefined })).toBe("/v1/search");
  });

  it("keeps zero", () => {
    expect(withQuery("/p", { k: 0 })).toBe("/p?k=0");
  });
});
