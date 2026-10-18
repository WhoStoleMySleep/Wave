/**
 * Moves a full-width fill instead of resizing it: a transform is composited on the GPU, while
 * animating `width` re-lays out the slider on every frame. The track clips the overflow.
 */
export function sliderFillTransform(percentage: number): string {
  return `translateX(${Math.min(100, Math.max(0, percentage)) - 100}%)`;
}
