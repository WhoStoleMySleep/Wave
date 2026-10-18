import { describe, expect, it } from "vitest";
import { readServerEvents, ServerEventParser } from "./serverEvents";

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
}

describe("ServerEventParser", () => {
  it("returns complete events and keeps a partial one for later", () => {
    const parser = new ServerEventParser<{ n: number }>();
    expect(parser.push('data: {"n":1}\n\ndata: {"n"')).toEqual([{ n: 1 }]);
    expect(parser.push(":2}\n\n")).toEqual([{ n: 2 }]);
  });

  it("joins multi-line data and ignores other fields", () => {
    const parser = new ServerEventParser<number[]>();
    expect(parser.push("event: candidate\ndata: [1,\ndata: 2]\n\n")).toEqual([[1, 2]]);
  });

  it("drops events without data or with broken JSON", () => {
    const parser = new ServerEventParser<unknown>();
    expect(parser.push(": keepalive\n\ndata: {oops\n\n")).toEqual([]);
  });
});

describe("readServerEvents", () => {
  it("yields events split across chunks", async () => {
    const events: unknown[] = [];
    for await (const event of readServerEvents(streamOf(['data: {"a"', ':1}\n\ndata: {"b":2}\n\n']))) events.push(event);
    expect(events).toEqual([{ a: 1 }, { b: 2 }]);
  });
});
