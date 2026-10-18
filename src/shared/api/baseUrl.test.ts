import { describe, expect, it } from "vitest";
import { API_BASE_URL, getApiBaseUrl } from "./baseUrl";

describe("baseUrl", () => {
  it("talks to the self-hosted server", () => {
    expect(getApiBaseUrl()).toBe(API_BASE_URL);
  });

  it("has no trailing slash", () => {
    expect(API_BASE_URL.endsWith("/")).toBe(false);
  });
});
