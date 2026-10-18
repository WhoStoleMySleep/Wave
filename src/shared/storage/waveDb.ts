import type { Track } from "@/shared/types";
import { IdbDatabase, type StoreName } from "./idbDatabase";
import { RecordStore } from "./recordStore";
import { jsonBytes, lyricsBytes, toCacheableLyrics, withProviders } from "./lyricsRecords";
import type {
  AudioPlayRecord,
  CachedArtistRecord,
  CachedAudioRecord,
  CachedLyricsRecord,
  CachedTrackRecord,
  CoverRecord,
  DownloadRecord,
  SnapshotRecord,
} from "./records";

export type * from "./records";

export interface AudioWrite {
  mimeType: string;
  lastPlayedAt?: number;
  loudnessDb?: number | null;
}

function sum<T>(records: readonly T[], size: (record: T) => number): number {
  return records.reduce((total, record) => total + size(record), 0);
}

function lastUsedAt(record: CachedAudioRecord): number {
  return record.lastPlayedAt ?? record.savedAt;
}

function withLastPlay(record: CachedAudioRecord, play: AudioPlayRecord | null | undefined): CachedAudioRecord {
  return play ? { ...record, lastPlayedAt: play.lastPlayedAt } : record;
}

function toTrackRecord(track: Track): CachedTrackRecord {
  return {
    id: track.id,
    title: track.title,
    artists: track.artists,
    albumTitle: track.album?.title,
    albumId: track.album?.id,
    coverUrl: track.coverUrl,
    durationMs: track.durationMs,
    savedAt: Date.now(),
  };
}

class WaveDb {
  private readonly db = new IdbDatabase(typeof indexedDB === "undefined" ? undefined : indexedDB);
  private readonly tracks = new RecordStore<CachedTrackRecord>(this.db, "tracks", (r) => r.id);
  private readonly audio = new RecordStore<CachedAudioRecord>(this.db, "audio", (r) => r.trackId);
  private readonly audioPlays = new RecordStore<AudioPlayRecord>(this.db, "audioPlays", (r) => r.trackId);
  private readonly lyrics = new RecordStore<CachedLyricsRecord>(this.db, "lyrics", (r) => r.trackId);
  private readonly artists = new RecordStore<CachedArtistRecord>(this.db, "artists", (r) => r.id);
  private readonly downloads = new RecordStore<DownloadRecord>(this.db, "downloads", (r) => r.trackId);
  private readonly snapshots = new RecordStore<SnapshotRecord>(this.db, "snapshots", (r) => r.key);
  private readonly covers = new RecordStore<CoverRecord>(this.db, "covers", (r) => r.url);

  private readonly stores: Record<StoreName, Pick<RecordStore<never>, "clear">> = {
    tracks: this.tracks,
    audio: this.audio,
    audioPlays: this.audioPlays,
    lyrics: this.lyrics,
    artists: this.artists,
    downloads: this.downloads,
    snapshots: this.snapshots,
    covers: this.covers,
  };

  public getTrack(id: string): Promise<CachedTrackRecord | null> {
    return this.tracks.get(id);
  }

  public putTrack(track: Track): Promise<void> {
    return this.tracks.put(toTrackRecord(track));
  }

  public async getTotalTrackBytes(): Promise<number> {
    return sum(await this.tracks.all(), jsonBytes);
  }

  public async getAudio(trackId: string): Promise<CachedAudioRecord | null> {
    const [record, play] = await Promise.all([this.audio.get(trackId), this.audioPlays.get(trackId)]);
    return record && withLastPlay(record, play);
  }

  /** Replacing the audio keeps when it was first cached and its loudness unless a new one is given. */
  public async putAudio(trackId: string, blob: Blob, write: AudioWrite): Promise<void> {
    const existing = await this.audio.get(trackId);
    const now = Date.now();
    const lastPlayedAt = write.lastPlayedAt ?? now;
    await this.audio.put({
      trackId,
      blob,
      mimeType: write.mimeType,
      byteSize: blob.size,
      savedAt: existing?.savedAt ?? now,
      lastPlayedAt,
      loudnessDb: write.loudnessDb ?? existing?.loudnessDb,
    });
    await this.audioPlays.put({ trackId, lastPlayedAt });
  }

  /**
   * Records a play in a store of its own: WebKit replaces the stored file on every put,
   * so rewriting the audio record would break the copy of it that is playing.
   */
  public async touchAudio(trackId: string): Promise<void> {
    if (await this.audio.has(trackId)) await this.audioPlays.put({ trackId, lastPlayedAt: Date.now() });
  }

  /** Least recently played first, the order the cache evicts in. */
  public async getOldestAudioRecords(): Promise<CachedAudioRecord[]> {
    const [records, plays] = await Promise.all([this.audio.all(), this.audioPlays.all()]);
    const playOf = new Map(plays.map((play) => [play.trackId, play]));
    return records.map((record) => withLastPlay(record, playOf.get(record.trackId))).sort((a, b) => lastUsedAt(a) - lastUsedAt(b));
  }

  public hasAudio(trackId: string): Promise<boolean> {
    return this.audio.has(trackId);
  }

  public async deleteAudio(trackId: string): Promise<void> {
    await Promise.all([this.audio.delete(trackId), this.audioPlays.delete(trackId)]);
  }

  public async getTotalAudioBytes(): Promise<number> {
    return sum(await this.audio.all(), (record) => record.byteSize || record.blob.size);
  }

  public async getLyrics(trackId: string): Promise<CachedLyricsRecord | null> {
    const record = await this.lyrics.get(trackId);
    return record && withProviders(record);
  }

  /** Stores nothing when no candidate is worth caching, e.g. line-level lyrics from a word-level provider. */
  public async putLyrics(record: CachedLyricsRecord): Promise<void> {
    const cacheable = toCacheableLyrics(record);
    if (cacheable) await this.lyrics.put(cacheable);
  }

  public async updateLyricsChecked(trackId: string): Promise<void> {
    const record = await this.getLyrics(trackId);
    if (record) await this.putLyrics({ ...record, lastCheckedAt: Date.now() });
  }

  public async getTotalLyricsBytes(): Promise<number> {
    return sum(await this.lyrics.all(), lyricsBytes);
  }

  /** Nothing writes artists any more; the size is still reported so old installs can see and clear them. */
  public async getTotalArtistBytes(): Promise<number> {
    return sum(await this.artists.all(), (record) => jsonBytes(record.data));
  }

  public getDownloads(): Promise<DownloadRecord[]> {
    return this.downloads.all();
  }

  /** Downloading again refreshes the track metadata but keeps the original download time. */
  public async putDownload(track: Track): Promise<DownloadRecord> {
    const existing = await this.downloads.get(track.id);
    const record = { trackId: track.id, track, downloadedAt: existing?.downloadedAt ?? Date.now() };
    await this.downloads.put(record);
    return record;
  }

  public deleteDownload(trackId: string): Promise<void> {
    return this.downloads.delete(trackId);
  }

  public async getDownloadIds(): Promise<Set<string>> {
    return new Set((await this.downloads.all()).map((record) => record.trackId));
  }

  public async getSnapshot<T>(key: string): Promise<SnapshotRecord<T> | null> {
    return (await this.snapshots.get(key)) as SnapshotRecord<T> | null;
  }

  public putSnapshot<T>(key: string, data: T): Promise<void> {
    return this.snapshots.put({ key, data, savedAt: Date.now() });
  }

  public deleteSnapshot(key: string): Promise<void> {
    return this.snapshots.delete(key);
  }

  public getCover(url: string): Promise<CoverRecord | null> {
    return this.covers.get(url);
  }

  public hasCover(url: string): Promise<boolean> {
    return this.covers.has(url);
  }

  public putCover(url: string, blob: Blob): Promise<void> {
    return this.covers.put({ url, blob, savedAt: Date.now() });
  }

  /** Drops the oldest covers beyond `max`. */
  public async trimCovers(max: number): Promise<void> {
    const oldestFirst = await this.covers.keysBy("savedAt");
    await this.covers.delete(oldestFirst.slice(0, Math.max(0, oldestFirst.length - max)));
  }

  /** Clearing audio also drops its play times, which mean nothing without it. */
  public async clearStore(name: StoreName): Promise<void> {
    await this.stores[name].clear();
    if (name === "audio") await this.audioPlays.clear();
  }

  public async clearAll(): Promise<void> {
    await Promise.all(Object.values(this.stores).map((store) => store.clear()));
  }

  public close(): Promise<void> {
    return this.db.close();
  }
}

export const waveDb = new WaveDb();
