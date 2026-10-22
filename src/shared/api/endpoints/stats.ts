import type { ArtistCover, Items, ListeningStats } from "../../contracts";
import { withQuery } from "../apiPath";
import { request } from "../client";

/** Instants bounding a period, end excluded; `utcOffset` is minutes east of UTC. */
export interface StatsPeriod {
  from: string;
  to: string;
  utcOffset: number;
}

export const statsEndpoints = {
  getListeningStats({ from, to, utcOffset }: StatsPeriod): Promise<ListeningStats> {
    return request<ListeningStats>(withQuery("/v1/me/stats", { from, to, utcOffset }));
  },

  /** Local months with any listening, newest first, as `YYYY-MM`. */
  getListeningMonths(utcOffset: number): Promise<Items<string>> {
    return request<Items<string>>(withQuery("/v1/me/stats/months", { utcOffset }));
  },

  /** Up to 20 artists; the answer keeps the order of `ids`. */
  getArtistCovers(ids: string[]): Promise<Items<ArtistCover>> {
    return request<Items<ArtistCover>>(withQuery("/v1/artists/covers", { ids: ids.join(",") }));
  },
};
