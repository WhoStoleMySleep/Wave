import { api } from "@/shared/api";
import { useCachedQuery } from "@/shared/cache/useCachedQuery";
import { toArtistPage, type ArtistPageData } from "../lib/artistPage";

export type { ArtistAlbumViewModel, ArtistPageData, ArtistReleaseViewModel } from "../lib/artistPage";

const STALE_AFTER_MS = 300_000;

export function useArtist(id: string | null) {
  const { data, isLoading } = useCachedQuery<ArtistPageData | null>(
    id ? `artist:${id}` : null,
    async () => (id ? toArtistPage(await api.getArtist(id)) : null),
    { fallback: null, staleTimeMs: STALE_AFTER_MS },
  );
  return { data, loading: isLoading };
}
