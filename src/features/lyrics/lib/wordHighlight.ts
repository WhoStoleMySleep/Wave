export interface WordTiming {
  timeMs: number;
  endMs: number;
}

const FULL = 100;

/** @returns how much of the word is sung, 0 to 100; a word without length lights up at once */
export function wordProgress(word: WordTiming, positionMs: number): number {
  if (positionMs < word.timeMs) return 0;
  if (word.endMs <= word.timeMs || positionMs >= word.endMs) return FULL;
  const progress = ((positionMs - word.timeMs) / (word.endMs - word.timeMs)) * FULL;
  return Number.isFinite(progress) ? progress : 0;
}

function highlight(progress: number): string {
  const stop = `${progress.toFixed(1)}%`;
  return `linear-gradient(to right, var(--color-text-primary) ${stop}, var(--color-text-tertiary) ${stop})`;
}

/** Writes the style only when it changes, so a still frame costs no style recalculation. */
export function paintWords(spans: readonly HTMLElement[] | undefined, words: readonly WordTiming[] | undefined, positionMs: number): void {
  if (!spans || !words || spans.length !== words.length) return;
  words.forEach((word, i) => {
    const span = spans[i];
    const background = highlight(wordProgress(word, positionMs));
    if (span && span.style.backgroundImage !== background) span.style.backgroundImage = background;
  });
}
