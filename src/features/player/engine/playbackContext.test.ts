import { describe, expect, it } from "vitest";
import { isRadioContext, parsePlaybackContext, resolveContext } from "./playbackContext";

describe("parsePlaybackContext", () => {
  it("splits the type from the id at the first colon only", () => {
    expect(parsePlaybackContext("playlist:42")).toEqual({ type: "playlist", id: "42" });
    expect(parsePlaybackContext("radio:a:b")).toEqual({ type: "radio", id: "a:b" });
  });

  it("keeps a bare type and skips an empty context", () => {
    expect(parsePlaybackContext("liked")).toEqual({ type: "liked" });
    expect(parsePlaybackContext(null)).toBeUndefined();
    expect(parsePlaybackContext("")).toBeUndefined();
  });
});

describe("isRadioContext", () => {
  it("recognizes a station by its prefix", () => {
    expect(isRadioContext("radio:1")).toBe(true);
    expect(isRadioContext("playlist:radio")).toBe(false);
    expect(isRadioContext(null)).toBe(false);
  });
});

describe("resolveContext", () => {
  it("takes the id and title of an object context", () => {
    expect(resolveContext({ id: "playlist:1", title: "Mine" }, null)).toEqual({ id: "playlist:1", title: "Mine" });
    expect(resolveContext({ id: "playlist:1" }, null)).toEqual({ id: "playlist:1", title: null });
  });

  it("keeps the current pair when a plain id repeats the playing one", () => {
    expect(resolveContext("playlist:1", "playlist:1")).toBeNull();
    expect(resolveContext(null, null)).toBeNull();
  });

  it("drops the title for a new plain id", () => {
    expect(resolveContext("album:2", "playlist:1")).toEqual({ id: "album:2", title: null });
  });
});
