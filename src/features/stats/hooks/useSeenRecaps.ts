import { useSyncExternalStore } from "react";

/** Recaps watched to the end on this device, by period id. */
const STORAGE_KEY = "wave_recap_seen";

const listeners = new Set<() => void>();
let snapshot: ReadonlySet<string> | null = null;

function readStorage(): ReadonlySet<string> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return new Set(Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function seenRecaps(): ReadonlySet<string> {
  snapshot ??= readStorage();
  return snapshot;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Remembers that the recap of a period was watched to its last slide. */
export function markRecapSeen(periodId: string): void {
  const seen = seenRecaps();
  if (seen.has(periodId)) return;
  snapshot = new Set([...seen, periodId]);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...snapshot]));
  } catch {
    // storage may be full or blocked; the mark still holds until the app restarts
  }
  listeners.forEach((listener) => listener());
}

export function useSeenRecaps(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, seenRecaps);
}
