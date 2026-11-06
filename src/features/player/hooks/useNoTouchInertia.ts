import { useEffect, type RefObject } from "react";

/**
 * Cancels the moves of a touch that an element handles itself. `touch-action: none` does not stop
 * Android WebView from carrying a quick flick on as inertia, and a tap landing within about a
 * second of it stops that inertia instead of clicking, even after the element is gone.
 */
export function useNoTouchInertia(ref: RefObject<HTMLElement | null>, enabled: boolean): void {
  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return;
    const cancel = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault();
    };
    element.addEventListener("touchmove", cancel, { passive: false });
    return () => element.removeEventListener("touchmove", cancel);
  }, [ref, enabled]);
}
