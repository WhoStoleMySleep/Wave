import type { PlaybackContext } from "@/shared/api";
import type { PlaybackContextInput } from "../store/playerStore";

const RADIO_PREFIX = "radio:";

export interface ResolvedContext {
  id: string | null;
  title: string | null;
}

export function isRadioContext(context: string | null): boolean {
  return context?.startsWith(RADIO_PREFIX) ?? false;
}

/** Splits `playlist:42` into `{ type, id }` at the first colon. */
export function parsePlaybackContext(context: string | null): PlaybackContext | undefined {
  if (!context) return undefined;
  const separator = context.indexOf(":");
  if (separator < 0) return { type: context };
  return { type: context.slice(0, separator), id: context.slice(separator + 1) };
}

/**
 * @returns the context pair to store, or null to keep the current one:
 * a queue row resends the playing id without its title
 */
export function resolveContext(input: PlaybackContextInput, current: string | null): ResolvedContext | null {
  if (input !== null && typeof input === "object") return { id: input.id, title: input.title ?? null };
  if (input === current) return null;
  return { id: input, title: null };
}
