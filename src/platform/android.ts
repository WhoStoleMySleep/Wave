/** Native helpers the Android shell exposes as `window.WaveAndroid`. */
export interface WaveAndroidApi {
  /** JSON of {@link AndroidMediaState}. */
  updateMedia(json: string): void;
  clearMedia(): void;
  moveToBack(): void;
  /** Missing in shells built before ducking; see `OtherAudio.kt`. */
  watchOtherAudio?(enabled: boolean): void;
}

export interface AndroidMediaState {
  title: string;
  artist: string;
  album: string;
  artworkUrl: string;
  durationMs: number;
  positionMs: number;
  playing: boolean;
  rate: number;
  /** Drives the heart in the notification and on the lock screen. */
  liked: boolean;
}

export function getAndroidShell(): WaveAndroidApi | undefined {
  return typeof window !== "undefined" ? window.WaveAndroid : undefined;
}
