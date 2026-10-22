import { useEffect, useMemo, useRef, useState } from "react";
import { playerEngine, usePlayerStore } from "@/features/player";
import { RecapAudio } from "../lib/recapAudio";
import { SAMPLE_MS, cueTracks, soundtrackTrackIds, type RecapCue } from "../lib/soundtrack";

export interface RecapSoundtrackOptions {
  cues: (RecapCue | null)[];
  index: number;
  paused: boolean;
  muted: boolean;
}

/** Which of a list slide's tracks is playing; it moves on every `SAMPLE_MS` while not paused and starts over after the last. */
function useSampleClock(cue: RecapCue | null, paused: boolean): number {
  const [clock, setClock] = useState({ cue, sample: 0 });
  if (clock.cue !== cue) setClock({ cue, sample: 0 });
  const sample = clock.cue === cue ? clock.sample : 0;
  const count = cue?.kind === "samples" ? cue.tracks.length : 0;
  const remainingMs = useRef(SAMPLE_MS);

  useEffect(() => {
    remainingMs.current = SAMPLE_MS;
  }, [cue, sample]);

  useEffect(() => {
    if (paused || count < 2) return;
    const startedAt = performance.now();
    const timer = setTimeout(() => setClock({ cue, sample: (sample + 1) % count }), remainingMs.current);
    return () => {
      clearTimeout(timer);
      remainingMs.current = Math.max(0, remainingMs.current - (performance.now() - startedAt));
    };
  }, [cue, sample, count, paused]);

  return sample;
}

/**
 * Plays the recap's music along its slides. The player pauses while the recap
 * is open and goes on afterwards if it was playing.
 * @returns the playing entry of a list slide
 */
export function useRecapSoundtrack({ cues, index, paused, muted }: RecapSoundtrackOptions): number {
  const [audio] = useState(() => new RecapAudio());
  const cue = cues[index] ?? null;
  const sample = useSampleClock(cue, paused);
  const track = cue?.kind === "samples" ? cue.tracks[sample] : cue?.track;
  const hasMusic = cues.some(Boolean);
  const allTrackIds = useMemo(() => soundtrackTrackIds(cues), [cues]);

  useEffect(() => {
    if (!hasMusic) return;
    const wasPlaying = usePlayerStore.getState().status === "playing";
    if (wasPlaying) playerEngine.pause();
    return () => {
      audio.stop();
      if (wasPlaying) playerEngine.resume();
    };
  }, [audio, hasMusic]);

  useEffect(() => {
    if (track) void audio.play(track);
  }, [audio, track]);

  useEffect(() => audio.prefetch(allTrackIds), [audio, allTrackIds]);

  useEffect(() => {
    audio.prepare([...cueTracks(cue), ...cueTracks(cues[index + 1]), ...cueTracks(cues[index - 1])]);
  }, [audio, cue, cues, index]);

  useEffect(() => audio.setPaused(paused), [audio, paused]);
  useEffect(() => audio.setMuted(muted), [audio, muted]);

  return sample;
}
