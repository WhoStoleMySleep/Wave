import { describe, expect, it } from "vitest";
import { parseDeeplink } from "./deeplink";

describe("parseDeeplink", () => {
  it("accepts real share targets", () => {
    expect(parseDeeplink("wave://artist?id=UCGtGpOIGHfRu1KYL9pi-mNQ")).toEqual({
      type: "artist",
      id: "UCGtGpOIGHfRu1KYL9pi-mNQ",
    });
    expect(parseDeeplink("wave://album?id=MPREb_xCxkOKReFZv")).toEqual({
      type: "album",
      id: "MPREb_xCxkOKReFZv",
    });
    expect(
      parseDeeplink("wave://playlist?id=VLPLD8jNKEyHYB2DHh5vXSI4USLFo29vzUYl"),
    ).toEqual({ type: "playlist", id: "VLPLD8jNKEyHYB2DHh5vXSI4USLFo29vzUYl" });
    expect(parseDeeplink("wave://track?id=RGdkabupfPI")).toEqual({
      type: "track",
      id: "RGdkabupfPI",
    });
  });

  it("rejects smuggled urls", () => {
    expect(parseDeeplink("https://evil.com")).toBeNull();
    expect(parseDeeplink("javascript:alert(1)")).toBeNull();
    expect(parseDeeplink("wave://artist?id=UCaaaaaaaaaaaaaaaaaaaaaa&x=1&y=2")).toEqual({
      type: "artist",
      id: "UCaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(
      parseDeeplink("wave://artist?id=UCaaaaaaaaaaaaaaaaaaaaaa&id=UCbbbbbbbbbbbbbbbbbbbbbb"),
    ).toBeNull();
    expect(parseDeeplink("wave://artist")).toBeNull();
    expect(parseDeeplink("wave://evil?id=RGdkabupfPI")).toBeNull();
    expect(parseDeeplink("wave://track?id=RGdkabupfPIextra")).toBeNull();
    expect(parseDeeplink("wave://artist?id=ABaaaaaaaaaaaaaaaaaaaaaa")).toBeNull();
    expect(parseDeeplink("wave://artist?id=UCaaa/../../../../etc")).toBeNull();
    expect(parseDeeplink("not a url")).toBeNull();
  });
});
