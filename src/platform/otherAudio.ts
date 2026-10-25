import { getAndroidShell } from "./android";

export type OtherAudioWatch = (onChange: (active: boolean) => void) => () => void;

/** How this shell reports another app's sound; null where it can't tell. */
export function otherAudioWatch(): OtherAudioWatch | null {
  const android = getAndroidShell();
  if (android) {
    if (typeof android.watchOtherAudio !== "function") return null;
    return (onChange) => {
      window.__waveOtherAudio = onChange;
      android.watchOtherAudio?.(true);
      return () => {
        android.watchOtherAudio?.(false);
        window.__waveOtherAudio = undefined;
      };
    };
  }
  return typeof window !== "undefined" ? (window.waveNative?.watchOtherAudio ?? null) : null;
}
