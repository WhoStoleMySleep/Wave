import { detectParser, type Lyric, type LyricPart } from "@braccato/parsers";
import { log } from "@/shared/utils/logger";
import { parseMusixmatchJson } from "./musixmatchFormats";

export interface WordData {
  timeMs: number;
  endMs: number;
  text: string;
  isBackground?: boolean;
}

export interface SyncedLine {
  timeMs: number;
  durationMs?: number;
  text: string;
  isInstrumental?: boolean;
  words?: WordData[];
}

export interface TimedLyrics {
  braccatoLyrics: Lyric[];
  syncedLines: SyncedLine[];
}

export interface ParsedLyrics extends TimedLyrics {
  plainLyrics: string | null;
}

const NO_LYRICS: ParsedLyrics = { braccatoLyrics: [], syncedLines: [], plainLyrics: null };

function parseLines(text: string, songDurationMs?: number): Lyric[] {
  try {
    return parseMusixmatchJson(text) ?? detectParser(text).parse(text, songDurationMs) ?? [];
  } catch (error) {
    log("yellow", "lyrics", "unparseable lyrics are shown as plain text", error);
    return [];
  }
}

function toWord(part: LyricPart): WordData {
  return { timeMs: part.startTimeMs, endMs: part.startTimeMs + part.durationMs, text: part.words, isBackground: part.isBackground };
}

function toSyncedLine(line: Lyric): SyncedLine {
  return {
    timeMs: line.startTimeMs,
    durationMs: line.durationMs,
    text: line.words,
    isInstrumental: Boolean(line.isInstrumental),
    words: line.parts?.map(toWord),
  };
}

/** Lyrics in any format the providers send; text no parser understands comes back as plain lyrics. */
export function parseRawLyrics(raw: string, songDurationMs?: number): ParsedLyrics {
  const text = raw?.trim() ?? "";
  if (!text) return NO_LYRICS;
  const lines = parseLines(text, songDurationMs);
  if (lines.length === 0) return { ...NO_LYRICS, plainLyrics: text };
  const plain = lines.map((line) => line.words).join("\n").trim();
  return { braccatoLyrics: lines, syncedLines: lines.map(toSyncedLine), plainLyrics: plain || null };
}

function shift(ms: number, offsetMs: number): number {
  return Math.max(0, ms + offsetMs);
}

function shiftPart(part: LyricPart, offsetMs: number): LyricPart {
  return { ...part, startTimeMs: shift(part.startTimeMs, offsetMs) };
}

function shiftLyric(line: Lyric, offsetMs: number): Lyric {
  const shifted: Lyric = { ...line, startTimeMs: shift(line.startTimeMs, offsetMs) };
  if (line.parts) shifted.parts = line.parts.map((part) => shiftPart(part, offsetMs));
  if (line.timedRomanization) shifted.timedRomanization = line.timedRomanization.map((part) => shiftPart(part, offsetMs));
  return shifted;
}

function shiftLine(line: SyncedLine, offsetMs: number): SyncedLine {
  const shifted: SyncedLine = { ...line, timeMs: shift(line.timeMs, offsetMs) };
  if (line.words) {
    shifted.words = line.words.map((word) => ({ ...word, timeMs: shift(word.timeMs, offsetMs), endMs: shift(word.endMs, offsetMs) }));
  }
  return shifted;
}

/** @returns copies moved by `offsetMs`, clamped at zero; the input itself when there is no offset */
export function applyLyricsOffset(lyrics: TimedLyrics, offsetMs: number): TimedLyrics {
  if (!offsetMs) return lyrics;
  return {
    braccatoLyrics: lyrics.braccatoLyrics.map((line) => shiftLyric(line, offsetMs)),
    syncedLines: lyrics.syncedLines.map((line) => shiftLine(line, offsetMs)),
  };
}
