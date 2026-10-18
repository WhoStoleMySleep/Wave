import { api } from "@/shared/api";
import { toClientTrack } from "@/shared/api/track";
import { log } from "@/shared/utils/logger";
import type { Track } from "@/shared/types";
import { errorMessage } from "./engineUtils";

import type { RadioOptions } from "@/shared/api/api";

const SAMPLE_SIZE = 3;

/**
 * @param purpose - what the request was for, in the log line on failure
 * @returns tracks the radio recommends after `seedId`, or null when the request failed
 */
export async function fetchRadioTracks(seedId: string, options: RadioOptions, purpose: string): Promise<Track[] | null> {
  try {
    const response = await api.getRadio(seedId, options);
    return response.items.map(toClientTrack);
  } catch (error) {
    log("yellow", "radio", `${purpose} failed: ${errorMessage(error)}`);
    return null;
  }
}

export function describeSample(tracks: readonly Track[]): string {
  return tracks
    .slice(0, SAMPLE_SIZE)
    .map((track) => `"${track.title}" by ${track.artists || "Unknown"}`)
    .join(", ");
}
