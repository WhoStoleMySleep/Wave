export const ACCENT_VARIANTS = [
  "default",
  "spotify",
  "discord",
  "telegram",
  "aurora",
  "sunset",
  "ocean",
  "forest",
  "berry",
  "carbon",
  "pixel",
  "scanlines",
  "vhs",
] as const;

export type AccentVariant = (typeof ACCENT_VARIANTS)[number];

/** Guards persisted settings: a variant removed in a later version must not reach the UI. */
export function isAccentVariant(value: unknown): value is AccentVariant {
  return ACCENT_VARIANTS.some((variant) => variant === value);
}
