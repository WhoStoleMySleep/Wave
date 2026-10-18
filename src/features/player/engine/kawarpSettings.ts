export interface KawarpSettings {
  warpIntensity: number;
  blurPasses: number;
  animationSpeed: number;
  transitionDuration: number;
  saturation: number;
  tintColor: readonly [number, number, number];
  tintIntensity: number;
  dithering: number;
  scale: number;
  maxFps: number;
}

export type KawarpOptions = Partial<KawarpSettings>;

export const DEFAULT_KAWARP_SETTINGS: KawarpSettings = {
  warpIntensity: 1.1,
  blurPasses: 8,
  animationSpeed: 1,
  transitionDuration: 1000,
  saturation: 1.4,
  tintColor: [0.157, 0.157, 0.235],
  tintIntensity: 0.15,
  dithering: 0.012,
  scale: 1.2,
  maxFps: 24,
};

export function resolveKawarpSettings(options: KawarpOptions = {}): KawarpSettings {
  const given = Object.entries(options).filter(([, value]) => value !== undefined);
  return { ...DEFAULT_KAWARP_SETTINGS, ...Object.fromEntries(given) };
}
