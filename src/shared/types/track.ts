import type { ArtistRef as ContractTrackArtist } from "../contracts";

export interface TrackArtist {
  id?: string;
  name: string;
}

export interface Track {
  id: string;
  playlistItemId?: string;
  /** When the track entered the playlist or the likes, for sorting by date added. */
  addedAt?: string;
  title: string;
  artists: string;
  artistId?: string;
  artistList?: (ContractTrackArtist | TrackArtist)[];
  coverUrl: string;
  durationMs: number;
  playCount: number;
  explicit?: boolean;
  releaseDate?: string;
  album?: {
    id: string;
    title: string;
  };
  /**
   * Set on queue entries the player brought in itself: "wave" for similar tracks
   * appended after the context ran out, "smart" for smart-shuffle picks. The flow
   * view badges them and smart shuffle uses it to take its picks back out.
   */
  queueSource?: "wave" | "smart";
}
