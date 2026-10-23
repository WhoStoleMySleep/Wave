import { create } from "zustand";

/** The catalog track whose YouTube match the user is choosing. */
export interface TrackMatchTarget {
  id: string;
  title: string;
  artists: string;
  coverUrl: string;
}

interface TrackMatchState {
  target: TrackMatchTarget | null;
  open: (target: TrackMatchTarget) => void;
  close: () => void;
}

export const useTrackMatchStore = create<TrackMatchState>((set) => ({
  target: null,
  open: (target) => set({ target }),
  close: () => set({ target: null }),
}));
