import { useCallback, useEffect, useState } from "react";
import { api, type TrackMatch } from "@/shared/api";
import { log } from "@/shared/utils/logger";

export interface TrackMatchState {
  match: TrackMatch | null;
  loading: boolean;
  error: Error | null;
  saving: boolean;
  /** @returns whether the server took the choice */
  choose: (youtubeId: string) => Promise<boolean>;
}

/** The current match of a catalog track and the YouTube candidates; nothing is loaded without an id. */
export function useTrackMatch(id: string | null): TrackMatchState {
  const [loaded, setLoaded] = useState<{ id: string; match: TrackMatch | null; error: Error | null } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    let current = true;
    api.getTrackMatch(id).then(
      (match) => current && setLoaded({ id, match, error: null }),
      (error: unknown) => {
        log("yellow", "catalogs", `match of ${id} unavailable`, error);
        if (current) setLoaded({ id, match: null, error: error instanceof Error ? error : new Error(String(error)) });
      },
    );
    return () => {
      current = false;
    };
  }, [id]);

  const choose = useCallback(
    async (youtubeId: string) => {
      if (!id) return false;
      setSaving(true);
      try {
        await api.setTrackMatch(id, youtubeId);
        return true;
      } catch (error) {
        log("yellow", "catalogs", `match of ${id} not saved`, error);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [id],
  );

  const fresh = loaded && loaded.id === id ? loaded : null;
  return {
    match: fresh?.match ?? null,
    error: fresh?.error ?? null,
    loading: !!id && !fresh,
    saving,
    choose,
  };
}
