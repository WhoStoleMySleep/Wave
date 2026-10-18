import { describe, expect, it } from "vitest";
import type { ImportJob } from "@/shared/api";
import { failedJob, latestList, mergeJobMessage, parseImportMessage } from "./importMessages";

const job: ImportJob = {
  id: "job-1",
  source: "spotify",
  sourceUrl: "https://open.spotify.com/playlist/1",
  title: "Road trip",
  status: "running",
  requiresDecision: false,
  result: { total: 10, imported: 2, skipped: 0 },
  createdAt: "2026-01-01T00:00:00Z",
};

describe("parseImportMessage", () => {
  it("returns job updates", () => {
    expect(parseImportMessage('{"type":"job","status":"running"}')).toEqual({ type: "job", status: "running" });
  });

  it("ignores other messages and broken json", () => {
    expect(parseImportMessage('{"type":"ping"}')).toBeNull();
    expect(parseImportMessage("null")).toBeNull();
    expect(parseImportMessage("{oops")).toBeNull();
  });
});

describe("mergeJobMessage", () => {
  it("keeps known identity fields the message leaves empty", () => {
    const merged = mergeJobMessage(job, { type: "job", status: "completed", title: "", playlistId: "p1" });
    expect(merged).toMatchObject({ id: "job-1", title: "Road trip", status: "completed", playlistId: "p1" });
  });

  it("keeps the last progress when the message has none", () => {
    expect(mergeJobMessage(job, { type: "job", status: "running" }).result).toEqual(job.result);
  });
});

describe("latestList", () => {
  it("replaces only with a non-empty list", () => {
    expect(latestList([2], [1])).toEqual([2]);
    expect(latestList([], [1])).toEqual([1]);
    expect(latestList(undefined, null)).toBeNull();
  });
});

describe("failedJob", () => {
  it("marks the job failed with the reason", () => {
    expect(failedJob(job, "DISCONNECTED", "gone")).toMatchObject({ status: "failed", error: { code: "DISCONNECTED", message: "gone" } });
  });

  it("stays empty without a job", () => {
    expect(failedJob(null, "X", "y")).toBeNull();
  });
});
