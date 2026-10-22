import type { DailyMixes, ListeningHistoryPage, LyricsStreamEvent, PlaybackEvent, PlaybackSession } from "../../contracts";
import { apiPath, withQuery } from "../apiPath";
import { openEventStream, request, requestNoContent } from "../client";
import { readServerEvents } from "../serverEvents";

export const playbackEndpoints = {
  /**
   * The server proxies the audio, so the session carries a URL the audio element can open without headers.
   * @param quiet - the caller gets by without the track, so a failure shows no toast
   */
  createPlaybackSession(trackId: string, signal?: AbortSignal, { quiet = false } = {}): Promise<PlaybackSession> {
    const path = apiPath`/v1/tracks/${trackId}/playback`;
    return request<PlaybackSession>(path, { method: "POST", body: { transport: "proxy" }, signal, quiet });
  },

  /** Each provider answers at its own pace, so candidates arrive as server-sent events. */
  async *streamLyrics(trackId: string, signal?: AbortSignal): AsyncGenerator<LyricsStreamEvent> {
    const stream = await openEventStream(apiPath`/v1/tracks/${trackId}/lyrics`, signal);
    yield* readServerEvents<LyricsStreamEvent>(stream);
  },

  /** A listen that does not get through waits on the device and is sent again, so a failure shows no toast. */
  recordPlaybackEvent(event: PlaybackEvent): Promise<void> {
    return requestNoContent("/v1/me/playback/events", { method: "POST", body: event, quiet: true });
  },

  /** `from` and `to` are instants that narrow the history, `to` excluded. */
  getHistory(cursor?: string, limit = 30, range: { from?: string; to?: string } = {}): Promise<ListeningHistoryPage> {
    return request<ListeningHistoryPage>(withQuery("/v1/me/history", { limit, cursor, from: range.from, to: range.to }));
  },

  getDailyMixes(): Promise<DailyMixes> {
    return request<DailyMixes>("/v1/me/recommendations/daily-mixes");
  },
};
