const VOLUME_CURVE = 2;

/** NaN from a corrupted saved session slips through Math.min/max, and the audio element throws on a NaN volume. */
function clampUnit(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Converts an audio gain to the slider position shown to the user. */
export function toVolumeLevel(gain: number): number {
  return Math.pow(clampUnit(gain), 1 / VOLUME_CURVE);
}

/** Loudness is perceived roughly logarithmically, so the squared slider position gives even steps. */
export function toVolumeGain(level: number): number {
  return Math.pow(clampUnit(level), VOLUME_CURVE);
}
