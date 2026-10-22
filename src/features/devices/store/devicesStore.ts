import { create } from "zustand";
import type { RemoteDevice } from "../lib/nowPlaying";

interface DevicesState {
  /** The user's other devices online now. */
  devices: RemoteDevice[];
  /** `performance.now()` when the list arrived, to move a playing position on by the time since. */
  receivedAt: number;
}

export const useDevicesStore = create<DevicesState>(() => ({ devices: [], receivedAt: 0 }));
