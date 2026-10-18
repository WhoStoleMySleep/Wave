import type { WaveNativeApi } from "./platform/native";
import type { WaveAndroidApi } from "./platform/android";

declare global {
  interface Window {
    waveNative?: WaveNativeApi;
    /** Injected by the Android shell before the page loads. */
    WaveAndroid?: WaveAndroidApi;
    /** Called by the Android shell for system media controls and headset buttons. */
    __waveMediaAction?: (action: string, positionMs: number) => void;
  }
}

export {};
