import { log } from "@/shared/utils/logger";

const EVENT_SEPARATOR = "\n\n";
const DATA_PREFIX = "data:";

function parseEvent<T>(block: string): T | null {
  const data = block
    .split("\n")
    .filter((line) => line.startsWith(DATA_PREFIX))
    .map((line) => line.slice(DATA_PREFIX.length).trim());
  if (data.length === 0) return null;
  try {
    return JSON.parse(data.join("\n")) as T;
  } catch (error) {
    log("yellow", "sse", "dropped an event that is not JSON", error);
    return null;
  }
}

export class ServerEventParser<T> {
  private pending = "";

  public push(text: string): T[] {
    const blocks = (this.pending + text).split(EVENT_SEPARATOR);
    this.pending = blocks.pop() ?? "";
    return blocks.map((block) => parseEvent<T>(block)).filter((event): event is T => event !== null);
  }
}

export async function* readServerEvents<T>(stream: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const parser = new ServerEventParser<T>();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      yield* parser.push(decoder.decode(value, { stream: true }));
    }
    yield* parser.push(decoder.decode());
  } finally {
    reader.releaseLock();
  }
}
