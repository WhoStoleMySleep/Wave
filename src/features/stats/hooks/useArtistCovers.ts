import { api, mediaUrl } from "@/shared/api";
import { useCachedQuery } from "@/shared/cache/useCachedQuery";

/** The server answers for this many artists at once. */
export const MAX_COVER_IDS = 20;
const STALE_AFTER_MS = 3_600_000;
const NO_COVERS: Record<string, string> = {};

/** Photo URLs by artist id for the first `MAX_COVER_IDS` ids; artists without a channel id are skipped. */
export function useArtistCovers(ids: string[]): Record<string, string> {
  const wanted = [...new Set(ids.filter(Boolean))].slice(0, MAX_COVER_IDS);
  const { data } = useCachedQuery(
    wanted.length > 0 ? `artist-covers:${wanted.join(",")}` : null,
    async () => {
      const { items } = await api.getArtistCovers(wanted);
      return Object.fromEntries((items ?? []).flatMap(({ id, cover }) => (cover ? [[id, mediaUrl(cover.url)]] : [])));
    },
    { fallback: NO_COVERS, staleTimeMs: STALE_AFTER_MS },
  );
  return data;
}
