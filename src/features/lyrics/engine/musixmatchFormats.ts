import type { Lyric, LyricPart } from "@braccato/parsers";

interface RichsyncToken {
  c: string;
  o?: number;
}

interface RichsyncLine {
  ts: number;
  te?: number;
  l?: RichsyncToken[];
}

interface SubtitleLine {
  text?: unknown;
  time?: { total?: number };
}

const MS_PER_SECOND = 1000;

function toMs(seconds: number): number {
  return Math.round(seconds * MS_PER_SECOND);
}

function isRichsyncLine(value: unknown): value is RichsyncLine {
  return typeof (value as RichsyncLine | null)?.ts === "number";
}

function isSubtitleLine(value: unknown): value is SubtitleLine {
  return typeof (value as SubtitleLine | null)?.time?.total === "number";
}

function wordStartMs(offsetSeconds: number, lineStartMs: number): number {
  const offsetMs = toMs(offsetSeconds);
  return offsetMs >= lineStartMs ? offsetMs : lineStartMs + offsetMs;
}

function mergeSpaces(tokens: readonly RichsyncToken[]): RichsyncToken[] {
  const words: RichsyncToken[] = [];
  for (const token of tokens) {
    if (typeof token?.c !== "string") continue;
    const previous = words[words.length - 1];
    if (token.c.trim()) words.push(token);
    else if (previous) words[words.length - 1] = { ...previous, c: previous.c + token.c };
  }
  return words;
}

function toParts(words: readonly RichsyncToken[], startMs: number, endMs: number): LyricPart[] {
  return words.map((word, i) => {
    const start = wordStartMs(word.o ?? 0, startMs);
    const nextOffset = words[i + 1]?.o;
    const end = nextOffset === undefined ? endMs : wordStartMs(nextOffset, startMs);
    return { startTimeMs: start, durationMs: Math.max(0, end - start), words: word.c };
  });
}

function fromRichsync(line: RichsyncLine): Lyric {
  const startMs = toMs(line.ts);
  const endMs = toMs(line.te ?? line.ts);
  const words = mergeSpaces(Array.isArray(line.l) ? line.l : []);
  const parts = toParts(words, startMs, endMs);
  return {
    startTimeMs: startMs,
    durationMs: Math.max(0, endMs - startMs),
    words: words.map((word) => word.c).join(""),
    parts: parts.length > 0 ? parts : undefined,
  };
}

function fromSubtitle(line: SubtitleLine): Lyric[] {
  const text = typeof line.text === "string" ? line.text.trim() : "";
  if (!text) return [];
  return [{ startTimeMs: toMs(Number(line.time?.total ?? 0)), durationMs: 0, words: text }];
}

function parseJsonArray(text: string): unknown[] | null {
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value) && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * Musixmatch richsync (word timings, spaces as tokens of their own) and subtitles (line timings).
 * @returns null for anything else, LRC included, which starts with `[` too
 */
export function parseMusixmatchJson(text: string): Lyric[] | null {
  if (!text.startsWith("[")) return null;
  const lines = parseJsonArray(text);
  if (!lines) return null;
  if (lines.every(isRichsyncLine)) return lines.map(fromRichsync);
  if (lines.every(isSubtitleLine)) return lines.flatMap(fromSubtitle);
  return null;
}
