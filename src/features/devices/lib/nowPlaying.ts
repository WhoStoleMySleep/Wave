import type { PlaybackHandoff, PlayerState } from "@/features/player";
import type { Track } from "@/shared/types";

/** Tracks of the queue sent around the current one; a long playlist would make every report heavy. */
const QUEUE_BEFORE = 50;
const QUEUE_AFTER = 250;

/** What a device plays, as it reports it to the user's other devices. */
export interface NowPlaying extends PlaybackHandoff {
  /** Only a playing track moves on; one still loading stands where it is. */
  playing: boolean;
}

export interface RemoteDevice {
  deviceId: string;
  name: string;
  platform: string;
  nowPlaying: NowPlaying | null;
  /** How old the report was when the server sent it. */
  ageMs: number;
}

/** @returns null when nothing is loaded */
export function snapshotOf(state: PlayerState): NowPlaying | null {
  const { currentTrack, currentIndex, queue } = state;
  if (!currentTrack) return null;
  const start = Math.max(0, currentIndex - QUEUE_BEFORE);
  const nearby = queue.slice(start, currentIndex + QUEUE_AFTER + 1);
  const inQueue = nearby[currentIndex - start]?.id === currentTrack.id;
  return {
    queue: inQueue ? nearby : [currentTrack],
    index: inQueue ? currentIndex - start : 0,
    positionMs: Math.round(state.positionMs),
    playing: state.status === "playing",
    context: state.playbackContext,
    contextTitle: state.playbackContextTitle,
    contextCover: state.playbackContextCover,
    shuffle: state.shuffle,
    repeat: state.repeat,
  };
}

export function currentTrackOf(nowPlaying: NowPlaying): Track | undefined {
  return nowPlaying.queue[nowPlaying.index];
}

/**
 * Where the other device is by now: a playing track moved on by the report's age
 * and the time since it arrived. Past the end it starts over, which beats silence.
 * @param sinceReceivedMs - time since the server's list arrived here
 */
export function handoffOf({ nowPlaying, ageMs }: RemoteDevice, sinceReceivedMs: number): PlaybackHandoff | null {
  if (!nowPlaying) return null;
  const { playing, ...handoff } = nowPlaying;
  const moved = playing ? ageMs + Math.max(0, sinceReceivedMs) : 0;
  const durationMs = currentTrackOf(nowPlaying)?.durationMs ?? 0;
  const positionMs = nowPlaying.positionMs + moved;
  return { ...handoff, positionMs: durationMs > 0 && positionMs >= durationMs ? 0 : positionMs };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseNowPlaying(value: unknown): NowPlaying | null {
  if (!isRecord(value) || !Array.isArray(value.queue) || typeof value.index !== "number") return null;
  const nowPlaying = value as unknown as NowPlaying;
  return currentTrackOf(nowPlaying)?.id ? nowPlaying : null;
}

/** The server's list of the other devices; anything malformed is left out. */
export function parseDevices(value: unknown): RemoteDevice[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((device): RemoteDevice[] => {
    if (!isRecord(device) || typeof device.deviceId !== "string") return [];
    return [
      {
        deviceId: device.deviceId,
        name: typeof device.name === "string" ? device.name : device.deviceId,
        platform: typeof device.platform === "string" ? device.platform : "desktop",
        nowPlaying: parseNowPlaying(device.nowPlaying),
        ageMs: typeof device.ageMs === "number" ? device.ageMs : 0,
      },
    ];
  });
}
