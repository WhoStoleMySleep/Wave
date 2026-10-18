import type { Track } from "@/shared/types";

export class QueueMemory {
  private master: Track[] = [];
  private upcoming: Track[] = [];

  public get masterPlaylist(): readonly Track[] {
    return this.master;
  }

  public remember(master: readonly Track[], originalUpcoming: readonly Track[]): void {
    this.master = [...master];
    this.upcoming = [...originalUpcoming];
  }

  public setMaster(tracks: readonly Track[]): void {
    this.master = [...tracks];
  }

  public setOriginalUpcoming(tracks: readonly Track[]): void {
    this.upcoming = [...tracks];
  }

  public clear(): void {
    this.remember([], []);
  }

  /** Keeps a track queued at the end in both lists, so it survives an unshuffle. */
  public append(track: Track, shuffled: boolean): void {
    if (this.master.length > 0) this.master = [...this.master, track];
    if (shuffled) this.upcoming = [...this.upcoming, track];
  }

  /** Keeps a "play next" track right after `current` in both lists. */
  public insertNext(track: Track, current: Track | null, shuffled: boolean): void {
    if (shuffled) this.upcoming = [track, ...this.upcoming];
    if (this.master.length === 0) return;
    const at = current ? this.master.findIndex((item) => item.id === current.id) : -1;
    const cut = at >= 0 ? at + 1 : this.master.length;
    this.master = [...this.master.slice(0, cut), track, ...this.master.slice(cut)];
  }

  /** The order an unshuffle restores: the whole context when known, otherwise what was upcoming. */
  public unshuffleReference(): readonly Track[] {
    return this.master.length > 0 ? this.master : this.upcoming;
  }
}
