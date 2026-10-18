import { describe, it, expect } from "vitest";
import { isCompleteAudioResponse } from "./audioResponse";

const response = (status: number, headers: Record<string, string> = {}) =>
  new Response(null, { status, headers: { "content-type": "audio/webm", ...headers } });

describe("isCompleteAudioResponse", () => {
  it("accepts a full 200 body", () => {
    expect(isCompleteAudioResponse(response(200))).toBe(true);
  });

  it("accepts a 206 that spans the whole file", () => {
    expect(isCompleteAudioResponse(response(206, { "content-range": "bytes 0-999/1000" }))).toBe(true);
  });

  it("rejects a 206 that stops short", () => {
    expect(isCompleteAudioResponse(response(206, { "content-range": "bytes 0-499/1000" }))).toBe(false);
  });

  it("rejects an error page served as 200", () => {
    expect(isCompleteAudioResponse(response(200, { "content-type": "application/json" }))).toBe(false);
    expect(isCompleteAudioResponse(response(200, { "content-type": "text/html" }))).toBe(false);
  });

  it("rejects failed statuses", () => {
    expect(isCompleteAudioResponse(response(403))).toBe(false);
  });
});
