export class CoverBlend {
  private startedAt: number | null = null;

  constructor(private readonly durationMs: number) {}

  public start(now: number): void {
    this.startedAt = now;
  }

  /** @returns the eased weight of the new cover, or null when no crossfade is running */
  public weight(now: number): number | null {
    if (this.startedAt === null) return null;
    const progress = Math.max(0, now - this.startedAt) / this.durationMs;
    if (progress >= 1) return null;
    return 0.5 - 0.5 * Math.cos(progress * Math.PI);
  }
}
