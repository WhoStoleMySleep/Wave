import { describe, expect, it } from "vitest";
import { DEFAULT_KAWARP_SETTINGS, resolveKawarpSettings } from "./kawarpSettings";

describe("resolveKawarpSettings", () => {
  it("returns the defaults without options", () => {
    expect(resolveKawarpSettings()).toEqual(DEFAULT_KAWARP_SETTINGS);
  });

  it("overrides only the given options", () => {
    const settings = resolveKawarpSettings({ saturation: 1.3, blurPasses: 0 });
    expect(settings).toEqual({ ...DEFAULT_KAWARP_SETTINGS, saturation: 1.3, blurPasses: 0 });
  });

  it("keeps the default when an option is undefined", () => {
    expect(resolveKawarpSettings({ scale: undefined }).scale).toBe(DEFAULT_KAWARP_SETTINGS.scale);
  });
});
